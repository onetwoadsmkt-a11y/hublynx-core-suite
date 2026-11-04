import { createServerFn } from "@tanstack/react-start";
import { isOverdue } from "@/lib/tasks/pending";
import { dueDayOffset } from "@/lib/tasks/due";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrganizationId } from "@/lib/org/resolve";

export type TodayTask = {
  id: string;
  title: string;
  due_date: string;
  status: string;
  priority: string | null;
  client_id: string | null;
  client_name: string | null;
  project_id: string | null;
  project_name: string | null;
};

export type TodayData = {
  overdue: TodayTask[];
  today: TodayTask[];
  upcoming: TodayTask[]; // próximos 7 dias (a partir de amanhã)
};

const input = z.object({ organizationId: z.string().uuid().nullable().optional() });

/** Tarefas do usuário logado na organização ativa, separadas por urgência. */
export const getTodayTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<TodayData> => {
    const db = context.supabase as any;
    const orgId = await resolveOrganizationId(db as never, context.userId, data.organizationId ?? null);

    // Dias no horário de Brasília (o servidor roda em UTC): até 7 dias à frente.
    const now = new Date();
    const end7 = new Date(now.getTime() + 8 * 86_400_000);

    let q = db
      .from("tasks")
      .select(
        "id, title, due_date, status, priority, client_id, project_id, clients(name), projects(name)",
      )
      // minhas: sou o responsável, ou criei e não há responsável
      .or(`assignee_id.eq.${context.userId},and(assignee_id.is.null,owner_id.eq.${context.userId})`)
      .not("status", "in", "(concluido,cancelado)")
      .not("due_date", "is", null)
      .lte("due_date", end7.toISOString())
      .order("due_date", { ascending: true })
      .limit(300);
    if (orgId) q = q.eq("organization_id", orgId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const map = (t: any): TodayTask => ({
      id: t.id as string,
      title: (t.title as string) ?? "Sem título",
      due_date: t.due_date as string,
      status: (t.status as string) ?? "a_fazer",
      priority: (t.priority as string | null) ?? null,
      client_id: (t.client_id as string | null) ?? null,
      client_name: t.clients?.name ?? null,
      project_id: (t.project_id as string | null) ?? null,
      project_name: t.projects?.name ?? null,
    });

    const overdue: TodayTask[] = [];
    const today: TodayTask[] = [];
    const upcoming: TodayTask[] = [];

    for (const raw of (rows ?? []) as any[]) {
      const task = map(raw);
      const offset = dueDayOffset(task.due_date, now) ?? 0;
      if (offset < 0 || isOverdue(task, now)) overdue.push(task);
      else if (offset === 0) today.push(task);
      else if (offset <= 7) upcoming.push(task);
    }

    return { overdue, today, upcoming };
  });
