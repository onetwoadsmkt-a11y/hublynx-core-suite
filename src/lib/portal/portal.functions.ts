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
};

export type PortalComment = {
  id: string;
  body: string;
  created_at: string;
  author: string;
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
};
export type PortalStage = {
  id: string;
  name: string;
  status: string;
  percent: number;
  start_date: string | null;
  due_date: string | null;
};
export type PortalProject = {
  project: {
    id: string;
    name: string;
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
      .select("name, project_number, organizations(name, logo_url, brand_color)")
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
      organization: org ?? null,
    };
  });

export const portalMyProjects = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const db = await portalDb(data.token);
    const { data: rows, error } = await db.rpc("portal_my_projects");
    if (error) throw new Error(error.message);
    return (rows ?? []) as PortalProjectSummary[];
  });

export const portalProject = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token, projectId: ref }).parse(d))
  .handler(async ({ data }) => {
    const db = await portalDb(data.token);
    // aceita o link personalizado (ex.: 12-joao-silva-valesafe) ou o id do projeto
    const { data: id, error: rErr } = await db.rpc("portal_resolve", { _ref: data.projectId });
    if (rErr) throw new Error(rErr.message);
    if (!id) throw new Error("NOT_CLIENT");
    const { data: row, error } = await db.rpc("portal_project", { _project: id });
    if (error) throw new Error(error.message);
    return row as PortalProject;
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
