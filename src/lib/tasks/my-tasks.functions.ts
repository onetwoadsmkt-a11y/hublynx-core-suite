import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MyTask = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  project_id: string | null;
  project_name: string | null;
  stage_name: string | null;
  href: string;
};

/** Tarefas em aberto designadas a quem está logado (projetos e agenda). */
export const listMyAssignedTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyTask[]> => {
    const db = context.supabase as any;
    const { data, error } = await db
      .from("tasks")
      .select("id, title, status, priority, due_date, project_id, stage_id")
      .eq("assignee_id", context.userId)
      .not("status", "in", "(concluido,cancelado)")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const pIds = [...new Set(rows.map((r) => r.project_id).filter(Boolean))];
    const sIds = [...new Set(rows.map((r) => r.stage_id).filter(Boolean))];
    const [ps, ss] = await Promise.all([
      pIds.length ? db.from("projects").select("id, name").in("id", pIds) : { data: [] },
      sIds.length ? db.from("project_stages").select("id, name").in("id", sIds) : { data: [] },
    ]);
    const pName = new Map(((ps.data ?? []) as any[]).map((p) => [p.id, p.name]));
    const sName = new Map(((ss.data ?? []) as any[]).map((s) => [s.id, s.name]));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority ?? null,
      due_date: r.due_date ?? null,
      project_id: r.project_id ?? null,
      project_name: (pName.get(r.project_id) as string) ?? null,
      stage_name: (sName.get(r.stage_id) as string) ?? null,
      href: r.project_id ? `/projetos/${r.project_id}?aba=etapas&tarefa=${r.id}` : `/tarefas?task=${r.id}`,
    }));
  });

/** Dispara os avisos de tarefas da empresa ativa (chamado com a tela aberta, no máximo a cada 10 min). */
export const runTaskNotificationsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await (context.supabase as any).rpc("is_org_member", { _org: data.organizationId });
    if (!ok) return { mails: 0, notified: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runTaskNotifications } = await import("./task-notify.server");
    let out = { mails: 0, notified: 0 };
    try {
      out = await runTaskNotifications(supabaseAdmin as any, { organizationId: data.organizationId, maxMails: 20 });
    } catch {
      /* segue para os avisos dos projetos */
    }
    try {
      const { runProjectMail } = await import("@/lib/projects/project-mail.server");
      const p = await runProjectMail(supabaseAdmin as any, { organizationId: data.organizationId, maxMails: 20 });
      out = { ...out, mails: out.mails + p.mails };
    } catch {
      /* fila ainda não criada ou caixa de e-mail desconectada */
    }
    return out;
  });
