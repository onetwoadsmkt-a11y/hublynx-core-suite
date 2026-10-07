import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrganizationId } from "@/lib/org/resolve";

/**
 * "Minha semana": junta as tarefas de projeto (`tasks`) e as tarefas de lead
 * (`lead_tasks`) numa lista só, separada por urgência. Também devolve os
 * projetos ativos sem nenhuma tarefa aberta e o total a receber vencido.
 */

export type WeekItem = {
  id: string;
  source: "task" | "lead";
  title: string;
  due: string | null;
  context: string | null;
  clientName: string | null;
  leadId: string | null;
  projectId: string | null;
};

export type WeekData = {
  overdue: WeekItem[];
  today: WeekItem[];
  week: WeekItem[];
  later: WeekItem[];
  noDate: WeekItem[];
  staleProjects: { id: string; name: string; clientName: string | null }[];
  receivablesOverdue: { count: number; total: number } | null;
};

const input = z.object({
  organizationId: z.string().uuid().nullable().optional(),
  /** `new Date().getTimezoneOffset()` do navegador (São Paulo = 180). */
  tzOffsetMinutes: z.number().int().min(-840).max(840).optional(),
});

export const getWeekOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<WeekData> => {
    const db = context.supabase as any;
    const userId = context.userId;
    const orgId = await resolveOrganizationId(db as never, userId, data.organizationId ?? null);
    const scope = <T>(q: T): T => (orgId ? (q as any).eq("organization_id", orgId) : q);

    const [tasksRes, leadTasksRes, projectsRes, openByProjectRes, finRes] = await Promise.all([
      scope(
        db
          .from("tasks")
          .select("id, title, due_date, project_id, clients(name), projects(name)")
          .eq("owner_id", userId)
          .neq("status", "concluido")
          .limit(500),
      ),
      scope(
        db
          .from("lead_tasks")
          .select("id, title, due_at, lead_id, leads(name)")
          .eq("owner_id", userId)
          .eq("done", false)
          .limit(500),
      ),
      scope(db.from("projects").select("id, name, clients(name)").eq("status", "ativo").limit(200)),
      scope(
        db
          .from("tasks")
          .select("project_id")
          .neq("status", "concluido")
          .not("project_id", "is", null)
          .limit(1000),
      ),
      scope(
        db
          .from("finances")
          .select("amount")
          .eq("kind", "receber")
          .eq("status", "aberto")
          .lt(
            "due_date",
            new Date(Date.now() - (data.tzOffsetMinutes ?? 180) * 60_000)
              .toISOString()
              .slice(0, 10),
          )
          .limit(1000),
      ),
    ]);

    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (leadTasksRes.error) throw new Error(leadTasksRes.error.message);

    const items: WeekItem[] = [
      ...((tasksRes.data ?? []) as any[]).map((t) => ({
        id: t.id as string,
        source: "task" as const,
        title: (t.title as string) || "Sem título",
        due: (t.due_date as string | null) ?? null,
        context: t.projects?.name ?? null,
        clientName: t.clients?.name ?? null,
        leadId: null,
        projectId: (t.project_id as string | null) ?? null,
      })),
      ...((leadTasksRes.data ?? []) as any[]).map((t) => ({
        id: t.id as string,
        source: "lead" as const,
        title: (t.title as string) || "Sem título",
        due: (t.due_at as string | null) ?? null,
        context: t.leads?.name ?? null,
        clientName: null,
        leadId: (t.lead_id as string | null) ?? null,
        projectId: null,
      })),
    ];

    // O servidor roda em UTC: os dias são calculados no fuso de quem está usando.
    // Datas gravadas à meia-noite UTC são "dia inteiro" e valem pela data em si.
    const offsetMs = (data.tzOffsetMinutes ?? 180) * 60_000;
    const dayKey = (iso: string) => {
      const d = new Date(iso);
      const allDay = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
      return allDay
        ? d.toISOString().slice(0, 10)
        : new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
    };
    const localNow = new Date(Date.now() - offsetMs);
    const todayKey = localNow.toISOString().slice(0, 10);
    // Fim da semana = domingo.
    const sunday = new Date(localNow);
    sunday.setUTCDate(sunday.getUTCDate() + ((7 - sunday.getUTCDay()) % 7));
    const sundayKey = sunday.toISOString().slice(0, 10);

    const out: WeekData = {
      overdue: [],
      today: [],
      week: [],
      later: [],
      noDate: [],
      staleProjects: [],
      receivablesOverdue: null,
    };
    for (const it of items) {
      if (!it.due) {
        out.noDate.push(it);
        continue;
      }
      const k = dayKey(it.due);
      if (k < todayKey) out.overdue.push(it);
      else if (k === todayKey) out.today.push(it);
      else if (k <= sundayKey) out.week.push(it);
      else out.later.push(it);
    }
    const byDue = (a: WeekItem, b: WeekItem) => (a.due ?? "").localeCompare(b.due ?? "");
    out.overdue.sort(byDue);
    out.today.sort(byDue);
    out.week.sort(byDue);
    out.later.sort(byDue);

    const withOpen = new Set(
      ((openByProjectRes.data ?? []) as any[]).map((r) => r.project_id as string),
    );
    out.staleProjects = ((projectsRes.data ?? []) as any[])
      .filter((p) => !withOpen.has(p.id as string))
      .map((p) => ({
        id: p.id as string,
        name: p.name as string,
        clientName: p.clients?.name ?? null,
      }));

    // Sem permissão no financeiro (RLS/módulo), simplesmente não mostra o card.
    if (!finRes.error) {
      const rows = (finRes.data ?? []) as any[];
      out.receivablesOverdue = {
        count: rows.length,
        total: rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      };
    }

    return out;
  });

export const setTaskDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), source: z.enum(["task", "lead"]), done: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const when = data.done ? new Date().toISOString() : null;
    const { error } =
      data.source === "lead"
        ? await context.supabase
            .from("lead_tasks")
            .update({ done: data.done, completed_at: when })
            .eq("id", data.id)
        : await (context.supabase as any)
            .from("tasks")
            .update({ status: data.done ? "concluido" : "a_fazer", completed_at: when })
            .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
