import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Arquivos das tarefas, mensagens e histórico da jornada do projeto (equipe / Core).
 * Leitura respeita as regras do banco (a equipe do projeto vê); gravação passa
 * pelo servidor, que confere a permissão e guarda o rastro (quem, quando, hash).
 */

export const ACCEPT_ATTACHMENTS = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.docx,.doc,.csv";
export const MAX_ATTACHMENT_MB = 20;

export type TaskAttachment = {
  id: string;
  task_id: string;
  name: string;
  size: number;
  mime: string | null;
  note: string | null;
  sha256: string | null;
  uploaded_at: string;
  uploaded_by: string;
  uploader_kind: "equipe" | "cliente";
  author: string;
  mine: boolean;
  task_title: string | null;
  drive_status: "pendente" | "ok" | "erro" | "sem_drive";
  drive_url: string | null;
  drive_error: string | null;
};

export type JourneyEvent = {
  at: string;
  kind: string;
  task_id: string | null;
  task: string | null;
  stage: string | null;
  detail: string | null;
  old: string | null;
  actor: string;
  actor_kind: "cliente" | "equipe" | "sistema";
  mine: boolean;
};

type Db = { from: (t: string) => any; rpc: (fn: string, a?: Record<string, unknown>) => any };
const uuid = z.string().uuid();

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db & { storage: any };
}

async function rpcBool(db: Db, fn: string, project: string) {
  const { data, error } = await db.rpc(fn, { _project: project });
  if (error) throw new Error(error.message);
  return data === true;
}

export const listProjectAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: rows, error } = await db
      .from("task_attachments")
      .select(
        "id, task_id, name, size, mime, note, sha256, uploaded_at, uploaded_by, uploader_kind, drive_status, drive_url, drive_error, tasks(title)",
      )
      .eq("project_id", data.projectId)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: true });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as (Omit<TaskAttachment, "author" | "mine" | "task_title"> & {
      tasks: { title: string } | { title: string }[] | null;
    })[];
    const ids = [...new Set(list.map((r) => r.uploaded_by))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await (
        await admin()
      )
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) {
        if (p.full_name) names.set(p.id, p.full_name);
      }
    }
    return list.map(({ tasks, ...r }) => ({
      ...r,
      task_title: (Array.isArray(tasks) ? tasks[0]?.title : tasks?.title) ?? null,
      mine: r.uploaded_by === context.userId,
      author: names.get(r.uploaded_by) ?? (r.uploader_kind === "cliente" ? "Cliente" : "Equipe"),
    })) as TaskAttachment[];
  });

export const uploadTaskAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Envio inválido.");
    const taskId = uuid.parse(d.get("taskId"));
    const file = d.get("file");
    const note = d.get("note");
    if (!(file instanceof File)) throw new Error("Selecione um arquivo.");
    return { taskId, file, note: typeof note === "string" ? note.slice(0, 500) : null };
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    // a tarefa precisa estar visível para quem envia (regras do banco)
    const { data: task, error } = await db
      .from("tasks")
      .select("id, project_id, organization_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task?.project_id) throw new Error("Tarefa não encontrada.");
    if (!(await rpcBool(db, "can_view_project", task.project_id))) {
      throw new Error("Sem acesso a este projeto.");
    }
    const { storeAttachment } = await import("./attachments.server");
    return storeAttachment(await admin(), {
      taskId: task.id,
      projectId: task.project_id,
      organizationId: task.organization_id ?? null,
      userId: context.userId,
      kind: "equipe",
      file: data.file,
      note: data.note,
    });
  });

async function visibleAttachment(db: Db, id: string) {
  const { data: row, error } = await db
    .from("task_attachments")
    .select("id, name, storage_path, uploaded_by, project_id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.deleted_at) throw new Error("Arquivo não encontrado.");
  return row as {
    id: string;
    name: string;
    storage_path: string;
    uploaded_by: string;
    project_id: string;
  };
}

export const attachmentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const row = await visibleAttachment(context.supabase as unknown as Db, data.id);
    const { signedDownloadUrl } = await import("./attachments.server");
    return { url: await signedDownloadUrl(await admin(), row.storage_path, row.name) };
  });

/** Remove da lista (fica no histórico, no armazenamento e no Drive). */
export const removeTaskAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const row = await visibleAttachment(db, data.id);
    if (
      row.uploaded_by !== context.userId &&
      !(await rpcBool(db, "can_edit_project", row.project_id))
    ) {
      throw new Error("Só quem enviou ou quem edita o projeto pode remover este arquivo.");
    }
    const { error } = await (
      await admin()
    )
      .from("task_attachments")
      .update({ deleted_at: new Date().toISOString(), deleted_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const retryAttachmentDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const row = await visibleAttachment(db, data.id);
    if (!(await rpcBool(db, "can_view_project", row.project_id))) throw new Error("Sem acesso.");
    const { archiveToDrive } = await import("./attachments.server");
    return archiveToDrive(await admin(), row.id);
  });

export const getProjectJourney = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: rows, error } = await db.rpc("project_journey", {
      _project: data.projectId,
      _limit: 400,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as JourneyEvent[];
  });

export const addProjectMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { error } = await db.from("project_messages").insert({
      project_id: data.projectId,
      author_id: context.userId,
      author_kind: "equipe",
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
