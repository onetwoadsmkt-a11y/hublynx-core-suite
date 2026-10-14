// Server-only — arquivos das tarefas do projeto: validação, guarda no Storage
// (bucket privado "task-attachments") e cópia no Google Drive da empresa.
type Db = { from: (t: string) => any; rpc?: (fn: string, a?: Record<string, unknown>) => any };
type AdminDb = Db & { storage: any };

export const ATTACHMENT_BUCKET = "task-attachments";
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Tipos aceitos: extensão → tipo e assinatura (bytes iniciais) */
const TYPES: Record<string, { mime: string; sig: (b: Uint8Array) => boolean }> = {
  pdf: { mime: "application/pdf", sig: (b) => starts(b, [0x25, 0x50, 0x44, 0x46]) },
  png: { mime: "image/png", sig: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47]) },
  jpg: { mime: "image/jpeg", sig: (b) => starts(b, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: "image/jpeg", sig: (b) => starts(b, [0xff, 0xd8, 0xff]) },
  webp: {
    mime: "image/webp",
    sig: (b) =>
      starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sig: (b) => starts(b, [0x50, 0x4b, 0x03, 0x04]),
  },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sig: (b) => starts(b, [0x50, 0x4b, 0x03, 0x04]),
  },
  xls: { mime: "application/vnd.ms-excel", sig: (b) => starts(b, [0xd0, 0xcf, 0x11, 0xe0]) },
  doc: { mime: "application/msword", sig: (b) => starts(b, [0xd0, 0xcf, 0x11, 0xe0]) },
  csv: { mime: "text/csv", sig: (b) => !b.subarray(0, 4096).includes(0) },
};

function starts(b: Uint8Array, sig: number[]) {
  return sig.every((v, i) => b[i] === v);
}

export function cleanFileName(name: string) {
  const base = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (base || "arquivo").slice(0, 180);
}

/** Lê e confere o arquivo (tamanho, extensão e conteúdo real). */
export async function readAttachment(file: File) {
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("Arquivo ausente.");
  if (file.size <= 0) throw new Error("O arquivo está vazio.");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("O arquivo deve ter no máximo 20 MB.");
  const name = cleanFileName(file.name);
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const type = TYPES[ext];
  if (!type) {
    throw new Error("Tipo não aceito. Envie PDF, imagem (PNG/JPG/WebP), Excel, Word ou CSV.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!type.sig(bytes)) {
    throw new Error(`O conteúdo não corresponde a um arquivo .${ext} válido.`);
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join("");
  return { name, ext, mime: type.mime, bytes, sha256 };
}

export type StoreInput = {
  taskId: string;
  projectId: string;
  organizationId: string | null;
  userId: string;
  kind: "equipe" | "cliente";
  file: File;
  note?: string | null;
};

/** Guarda no Storage, registra (o banco grava o histórico) e copia para o Drive. */
export async function storeAttachment(admin: AdminDb, input: StoreInput) {
  const f = await readAttachment(input.file);
  const id = crypto.randomUUID();
  const path = `p/${input.projectId}/${input.taskId}/${id}.${f.ext}`;
  const up = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, f.bytes, { contentType: f.mime, upsert: false });
  if (up.error) throw new Error(`Falha ao guardar o arquivo: ${up.error.message}`);

  const { error } = await admin.from("task_attachments").insert({
    id,
    task_id: input.taskId,
    project_id: input.projectId,
    organization_id: input.organizationId,
    owner_id: input.userId,
    uploaded_by: input.userId,
    uploader_kind: input.kind,
    name: f.name,
    size: f.bytes.length,
    mime: f.mime,
    storage_path: path,
    sha256: f.sha256,
    note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
  });
  if (error) {
    await admin.storage
      .from(ATTACHMENT_BUCKET)
      .remove([path])
      .catch(() => null);
    throw new Error(error.message);
  }
  const drive = await archiveToDrive(admin, id, f.bytes);
  return { id, name: f.name, size: f.bytes.length, sha256: f.sha256, drive };
}

export async function signedDownloadUrl(admin: AdminDb, path: string, name: string) {
  const { data, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, 300, { download: name });
  if (error || !data?.signedUrl) throw new Error("Não foi possível abrir o arquivo agora.");
  return data.signedUrl as string;
}

// ---------------------------------------------------------------- Google Drive

export type DriveResult = {
  status: "ok" | "erro" | "sem_drive";
  url: string | null;
  error: string | null;
};

/** Conta Google da empresa que recebe as cópias: dono do projeto, depois admins. */
async function pickDriveUser(
  admin: Db,
  project: { owner_id: string | null; organization_id: string | null },
) {
  const { getConnection } = await import("@/server/googleOAuth.server");
  const ids: string[] = [];
  if (project.owner_id) ids.push(project.owner_id);
  if (project.organization_id) {
    const { data } = await admin
      .from("organization_members")
      .select("user_id, created_at")
      .eq("organization_id", project.organization_id)
      .in("role", ["org_admin", "owner", "admin"])
      .eq("status", "active")
      .order("created_at", { ascending: true });
    for (const r of (data ?? []) as { user_id: string }[]) ids.push(r.user_id);
  }
  for (const id of ids.filter((v, i, a) => !!v && a.indexOf(v) === i)) {
    const conn = await getConnection(id).catch(() => null);
    const ok = (conn?.scopes ?? []).some((s) => s === "drive.file" || s.endsWith("/drive.file"));
    if (conn?.access_token && conn.status !== "revoked" && ok) {
      return { userId: id, email: conn.google_email ?? null };
    }
  }
  return null;
}

async function driveJson(userId: string, path: string, init?: RequestInit) {
  const { googleFetch } = await import("@/server/googleOAuth.server");
  const res = await googleFetch(userId, path, init);
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Google Drive [${res.status}]: ${text.slice(0, 240)}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

async function ensureFolder(
  admin: Db,
  userId: string,
  key: string,
  name: string,
  parent: string | null,
) {
  const { data: cached } = await admin
    .from("drive_folders")
    .select("folder_id")
    .eq("key", key)
    .maybeSingle();
  if (cached?.folder_id) return cached.folder_id as string;
  const body: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parent) body.parents = [parent];
  const out = await driveJson(userId, "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
  await admin.from("drive_folders").upsert({ key, folder_id: out.id, drive_user_id: userId });
  return out.id as string;
}

/**
 * Copia o arquivo para "Core Suite — <empresa>/Nº <n> · <projeto>" no Drive da conta
 * conectada. Nunca lança erro: grava o resultado na linha do arquivo.
 */
export async function archiveToDrive(
  admin: AdminDb,
  attachmentId: string,
  bytes?: Uint8Array,
): Promise<DriveResult> {
  const save = async (patch: Record<string, unknown>) => {
    await admin.from("task_attachments").update(patch).eq("id", attachmentId);
  };
  try {
    const { data: a } = await admin
      .from("task_attachments")
      .select(
        "id, name, mime, storage_path, sha256, note, uploaded_by, uploader_kind, uploaded_at, task_id, project_id, drive_file_id",
      )
      .eq("id", attachmentId)
      .maybeSingle();
    if (!a) return { status: "erro", url: null, error: "Arquivo não encontrado." };
    const { data: p } = await admin
      .from("projects")
      .select("id, name, project_number, owner_id, organization_id, organizations(name)")
      .eq("id", a.project_id)
      .maybeSingle();
    if (!p) return { status: "erro", url: null, error: "Projeto não encontrado." };

    const drive = await pickDriveUser(admin, p);
    if (!drive) {
      const msg =
        "Nenhuma conta Google com Drive conectada na empresa (Configurações → Integrações).";
      await save({ drive_status: "sem_drive", drive_error: msg });
      return { status: "sem_drive", url: null, error: msg };
    }

    const [{ data: t }, { data: who }] = await Promise.all([
      admin
        .from("tasks")
        .select("title, stage_id, project_stages(name)")
        .eq("id", a.task_id)
        .maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", a.uploaded_by).maybeSingle(),
    ]);
    const org = (Array.isArray(p.organizations) ? p.organizations[0] : p.organizations) as {
      name?: string;
    } | null;
    const stage = (Array.isArray(t?.project_stages) ? t?.project_stages[0] : t?.project_stages) as {
      name?: string;
    } | null;
    const taskTitle = (t?.title as string | undefined) ?? "Tarefa";

    if (!bytes) {
      const dl = await admin.storage.from(ATTACHMENT_BUCKET).download(a.storage_path);
      if (dl.error || !dl.data) throw new Error("Arquivo não encontrado no armazenamento.");
      bytes = new Uint8Array(await (dl.data as Blob).arrayBuffer());
    }

    const upload = async () => {
      const root = await ensureFolder(
        admin,
        drive.userId,
        `root:${p.organization_id}:${drive.userId}`,
        `Core Suite — ${cleanFileName(org?.name ?? "Projetos")}`,
        null,
      );
      const folder = await ensureFolder(
        admin,
        drive.userId,
        `project:${p.id}:${drive.userId}`,
        cleanFileName(`${p.project_number ? `Nº ${p.project_number} · ` : ""}${p.name}`),
        root,
      );
      const day = String(a.uploaded_at ?? new Date().toISOString()).slice(0, 10);
      const meta = {
        name: cleanFileName(`${day} · ${taskTitle} · ${a.name}`),
        mimeType: a.mime ?? "application/octet-stream",
        parents: [folder],
        description: [
          `Projeto: ${p.name}`,
          stage?.name ? `Etapa: ${stage.name}` : null,
          `Tarefa: ${taskTitle}`,
          `Enviado por: ${(who?.full_name as string | undefined) ?? "Usuário"} (${a.uploader_kind}) em ${a.uploaded_at}`,
          a.note ? `Observação: ${a.note}` : null,
          `SHA-256: ${a.sha256}`,
          "Cópia automática do Core Suite.",
        ]
          .filter(Boolean)
          .join("\n"),
        appProperties: { coreAttachmentId: a.id },
      };
      const boundary = "core_" + crypto.randomUUID();
      const body = new Blob(
        [
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}`,
          `\r\n--${boundary}\r\nContent-Type: ${meta.mimeType}\r\n\r\n`,
          bytes as unknown as BlobPart,
          `\r\n--${boundary}--`,
        ],
        { type: `multipart/related; boundary=${boundary}` },
      );
      return driveJson(
        drive.userId,
        "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
        {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        },
      );
    };

    let out: { id: string; webViewLink?: string };
    try {
      out = await upload();
    } catch (err) {
      // pasta apagada no Drive: recria e tenta mais uma vez
      if ((err as { status?: number }).status === 404) {
        await admin.from("drive_folders").delete().like("key", `%:${drive.userId}`);
        out = await upload();
      } else throw err;
    }
    const url = out.webViewLink ?? `https://drive.google.com/file/d/${out.id}/view`;
    await save({
      drive_status: "ok",
      drive_file_id: out.id,
      drive_url: url,
      drive_account: drive.email,
      drive_error: null,
    });
    return { status: "ok", url, error: null };
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).slice(0, 400);
    await save({ drive_status: "erro", drive_error: msg }).catch(() => null);
    return { status: "erro", url: null, error: msg };
  }
}
