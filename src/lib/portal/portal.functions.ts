import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/env";

/**
 * Portal do cliente (Fase 3). O cliente não lê as tabelas diretamente: tudo passa
 * por funções do banco que conferem se ele é cliente daquele projeto e devolvem
 * só o que pode ver (etapas, tarefas dele e as marcadas como visíveis).
 *
 * O portal tem sessão própria (separada do login do Core): cada chamada leva o
 * token da sessão do portal e roda com as permissões desse usuário.
 */

export type PortalProjectSummary = {
  id: string;
  slug?: string | null;
  number?: number | null;
  name: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  organization: { name: string; logo_url: string | null; brand_color: string | null };
  stages_total: number;
  stages_done: number;
  progress: number;
  my_open_tasks: number;
  logo_url?: string | null;
};

export type PortalComment = {
  id: string;
  body: string;
  created_at: string;
  author: string;
  author_kind?: "equipe" | "cliente";
  mine: boolean;
};
export type PortalTask = {
  id: string;
  stage_id: string | null;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  responsible_type: "equipe" | "cliente";
  comments: PortalComment[];
  attachments?: PortalAttachment[];
};
export type PortalAttachment = {
  id: string;
  name: string;
  size: number;
  mime: string | null;
  created_at: string;
  note: string | null;
  author: string;
  mine: boolean;
};
export type PortalJourneyEvent = {
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
export type PortalStage = {
  id: string;
  name: string;
  status: string;
  percent: number;
  start_date: string | null;
  due_date: string | null;
  phase?: string | null;
  week_label?: string | null;
  alert?: string | null;
};
export type PortalProject = {
  project: {
    id: string;
    name: string;
    logo_url?: string | null;
    status: string;
    description: string | null;
    start_date: string | null;
    due_date: string | null;
  };
  organization: { name: string; logo_url: string | null; brand_color: string | null };
  stages: PortalStage[];
  tasks: PortalTask[];
  team: { name: string | null; role: string | null }[];
};

const uuid = z.string().uuid();
const token = z.string().min(20).max(4096);
const ref = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9-]+$/i);
type Db = {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
  from: (t: string) => any;
};

export const PORTAL_AUTH_ERROR = "PORTAL_AUTH";

/** Cliente do banco com as permissões do usuário do portal (token conferido). */
async function portalDb(accessToken: string): Promise<Db> {
  const db = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(accessToken);
  if (error || !data?.user) throw new Error(PORTAL_AUTH_ERROR);
  return db as unknown as Db;
}

/** Logos dos projetos que o usuário já pode ver (ids vindos das funções do portal). */
async function withLogos(ids: string[]): Promise<Map<string, string | null>> {
  if (!ids.length) return new Map();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as unknown as Db)
    .from("projects")
    .select("id, logo_url")
    .in("id", ids);
  return new Map(
    ((data ?? []) as { id: string; logo_url: string | null }[]).map((r) => [r.id, r.logo_url]),
  );
}

/**
 * Dados públicos da tela de entrada do portal: nome do projeto e marca da empresa.
 * Só pelo link do projeto; não expõe tarefas, valores nem pessoas.
 */
export const portalPublicInfo = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ projectRef: ref }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Db;
    const r = data.projectRef.toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(r);
    const { data: row } = await admin
      .from("projects")
      .select("name, project_number, logo_url, organizations(name, logo_url, brand_color)")
      .eq(isUuid ? "id" : "portal_slug", r)
      .maybeSingle();
    if (!row) return null;
    const org = (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as {
      name: string;
      logo_url: string | null;
      brand_color: string | null;
    } | null;
    return {
      projectName: row.name as string,
      projectNumber: (row.project_number as number | null) ?? null,
      projectLogo: (row.logo_url as string | null) ?? null,
      organization: org ?? null,
    };
  });

export const portalMyProjects = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const db = await portalDb(data.token);
    const { data: rows, error } = await db.rpc("portal_my_projects");
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as PortalProjectSummary[];
    return withLogos(list.map((p) => p.id)).then((logos) =>
      list.map((p) => ({ ...p, logo_url: logos.get(p.id) ?? null })),
    );
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id do projeto quando quem abriu o portal é da equipe (a regra de leitura do projeto confere). */
async function teamProjectId(db: any, projectRef: string): Promise<string | null> {
  try {
    const q = db.from("projects").select("id").limit(1);
    const { data } = UUID_RE.test(projectRef)
      ? await q.eq("id", projectRef)
      : await q.eq("portal_slug", projectRef.toLowerCase());
    const id = (data?.[0]?.id as string | undefined) ?? null;
    if (!id) return null;
    const { data: ok } = await db.rpc("can_view_project", { _project: id });
    return ok ? id : null;
  } catch {
    return null;
  }
}

export const portalProject = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token, projectId: ref }).parse(d))
  .handler(async ({ data }) => {
    const db = await portalDb(data.token);
    // aceita o link personalizado (ex.: 12-joao-silva-valesafe) ou o id do projeto
    const { data: id, error: rErr } = await db.rpc("portal_resolve", { _ref: data.projectId });
    if (rErr) throw new Error(rErr.message);
    if (!id) {
      // Conta da equipe abrindo o link do cliente: indica o projeto no Core.
      const teamId = await teamProjectId(db, data.projectId);
      throw new Error(teamId ? `TEAM_MEMBER:${teamId}` : "NOT_CLIENT");
    }
    const { data: row, error } = await db.rpc("portal_project", { _project: id });
    if (error) throw new Error(error.message);
    const out = row as PortalProject;
    const logos = await withLogos([id as string]);
    return { ...out, project: { ...out.project, logo_url: logos.get(id as string) ?? null } };
  });

export const portalSetTaskDone = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token, taskId: uuid, done: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const db = await portalDb(data.token);
    const { error } = await db.rpc("portal_set_task_done", {
      _task: data.taskId,
      _done: data.done,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const portalAddComment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token, taskId: uuid, body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await portalDb(data.token);
    const { error } = await db.rpc("portal_add_comment", { _task: data.taskId, _body: data.body });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db & { storage: any };
}

/** Cliente anexa um arquivo numa tarefa dele (ou visível para ele). */
export const portalUploadAttachment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Envio inválido.");
    const file = d.get("file");
    const note = d.get("note");
    if (!(file instanceof File)) throw new Error("Selecione um arquivo.");
    return {
      token: token.parse(d.get("token")),
      taskId: uuid.parse(d.get("taskId")),
      file,
      note: typeof note === "string" ? note.slice(0, 500) : null,
    };
  })
  .handler(async ({ data }) => {
    const db = await portalDb(data.token);
    const { data: target, error } = await db.rpc("portal_attach_target", { _task: data.taskId });
    if (error) throw new Error(error.message);
    const t = target as {
      task_id: string;
      project_id: string;
      organization_id: string | null;
      user_id: string;
    };
    const { storeAttachment } = await import("@/lib/projects/attachments.server");
    const out = await storeAttachment(await adminDb(), {
      taskId: t.task_id,
      projectId: t.project_id,
      organizationId: t.organization_id,
      userId: t.user_id,
      kind: "cliente",
      file: data.file,
      note: data.note,
    });
    return { id: out.id, name: out.name, size: out.size };
  });

export const portalAttachmentUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token, id: uuid }).parse(d))
  .handler(async ({ data }) => {
    const db = await portalDb(data.token);
    const { data: target, error } = await db.rpc("portal_attachment_target", {
      _attachment: data.id,
    });
    if (error) throw new Error(error.message);
    const t = target as { storage_path: string; name: string };
    const { signedDownloadUrl } = await import("@/lib/projects/attachments.server");
    return { url: await signedDownloadUrl(await adminDb(), t.storage_path, t.name) };
  });

/** Cliente tira da lista um arquivo que ele mesmo enviou (continua no histórico). */
export const portalRemoveAttachment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token, id: uuid }).parse(d))
  .handler(async ({ data }) => {
    const db = await portalDb(data.token);
    const { data: target, error } = await db.rpc("portal_attachment_target", {
      _attachment: data.id,
    });
    if (error) throw new Error(error.message);
    const t = target as { id: string; mine: boolean; user_id: string };
    if (!t.mine) throw new Error("Você só pode remover arquivos que você enviou.");
    const { error: upErr } = await (
      await adminDb()
    )
      .from("task_attachments")
      .update({ deleted_at: new Date().toISOString(), deleted_by: t.user_id })
      .eq("id", t.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const };
  });

export const portalJourney = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token, projectId: uuid }).parse(d))
  .handler(async ({ data }) => {
    const db = await portalDb(data.token);
    const { data: rows, error } = await db.rpc("project_journey", {
      _project: data.projectId,
      _limit: 300,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as PortalJourneyEvent[];
  });

export const portalAddMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token, projectId: uuid, body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await portalDb(data.token);
    const { error } = await db.rpc("portal_add_message", {
      _project: data.projectId,
      _body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
