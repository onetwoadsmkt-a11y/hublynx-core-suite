import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Portal do cliente (Fase 3). O cliente não lê as tabelas diretamente: tudo passa
 * por funções do banco que conferem se ele é cliente daquele projeto e devolvem
 * só o que pode ver (etapas, tarefas dele e as marcadas como visíveis).
 */

export type PortalProjectSummary = {
  id: string;
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
type Db = { rpc: (fn: string, args?: Record<string, unknown>) => any };

export const portalMyProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as Db;
    const { data, error } = await db.rpc("portal_my_projects");
    if (error) throw new Error(error.message);
    return (data ?? []) as PortalProjectSummary[];
  });

export const portalProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: row, error } = await db.rpc("portal_project", { _project: data.projectId });
    if (error) throw new Error(error.message);
    return row as PortalProject;
  });

export const portalSetTaskDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: uuid, done: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { error } = await db.rpc("portal_set_task_done", {
      _task: data.taskId,
      _done: data.done,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const portalAddComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ taskId: uuid, body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { error } = await db.rpc("portal_add_comment", { _task: data.taskId, _body: data.body });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
