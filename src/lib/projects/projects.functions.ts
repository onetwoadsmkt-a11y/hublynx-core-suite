import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ProjectStatus =
  | "planejamento"
  | "ativo"
  | "aguardando_cliente"
  | "em_pausa"
  | "concluido"
  | "cancelado";

export interface ProjectRow {
  id: string;
  owner_id: string;
  client_id: string | null;
  manager_id: string | null;
  name: string;
  description: string | null;
  start_date: string | null;
  due_date: string | null;
  value: number | null;
  contract_value: number | null;
  status: ProjectStatus;
  progress: number;
  color: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Projects CRUD ----------
export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: projects, error } = await context.supabase
      .from("projects")
      .select("*, clients(id, name, company)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (projects ?? []).map((p: any) => p.id);
    let taskCounts: Record<string, { total: number; done: number; overdue: number }> = {};
    if (ids.length) {
      const { data: tasks } = await context.supabase
        .from("tasks")
        .select("project_id, status, due_date")
        .in("project_id", ids);
      const now = new Date();
      (tasks ?? []).forEach((t: any) => {
        const pid = t.project_id as string;
        if (!taskCounts[pid]) taskCounts[pid] = { total: 0, done: 0, overdue: 0 };
        taskCounts[pid].total += 1;
        if (t.status === "concluido") taskCounts[pid].done += 1;
        else if (t.due_date && new Date(t.due_date) < now) taskCounts[pid].overdue += 1;
      });
    }

    let stageCounts: Record<string, { total: number; done: number; percent: number }> = {};
    if (ids.length) {
      const { data: stages } = await (context.supabase as any)
        .from("project_stages")
        .select("project_id, status, percent")
        .in("project_id", ids);
      const acc: Record<string, { total: number; done: number; sum: number }> = {};
      (stages ?? []).forEach((s: any) => {
        const pid = s.project_id as string;
        if (!acc[pid]) acc[pid] = { total: 0, done: 0, sum: 0 };
        acc[pid].total += 1;
        if (s.status === "done") acc[pid].done += 1;
        acc[pid].sum += Number(s.percent ?? 0);
      });
      stageCounts = Object.fromEntries(
        Object.entries(acc).map(([pid, v]) => [
          pid,
          { total: v.total, done: v.done, percent: v.total ? Math.round(v.sum / v.total) : 0 },
        ]),
      );
    }

    return {
      projects: (projects ?? []).map((p: any) => ({
        ...p,
        client: p.clients,
        task_stats: taskCounts[p.id] ?? { total: 0, done: 0, overdue: 0 },
        stage_stats: stageCounts[p.id] ?? { total: 0, done: 0, percent: 0 },
      })),
    };
  });

const projectInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  manager_id: z.string().uuid().nullable().optional(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  contract_value: z.number().nonnegative().nullable().optional(),
  status: z.enum([
    "planejamento",
    "ativo",
    "aguardando_cliente",
    "em_pausa",
    "concluido",
    "cancelado",
  ]),
  color: z.string().max(20).nullable().optional(),
  // commercial model
  service_type: z.enum(["desenvolvimento","trafego_pago","gestao_conteudo","consultoria","design","suporte","outros"]).nullable().optional(),
  commercial_model: z.enum(["projeto_fechado","mensal_recorrente","banco_horas","por_hora","suporte_continuo"]).optional(),
  hourly_rate: z.number().nonnegative().nullable().optional(),
  contracted_hours: z.number().nonnegative().nullable().optional(),
  monthly_value: z.number().nonnegative().nullable().optional(),
  billing_day: z.number().int().min(1).max(28).nullable().optional(),
  next_billing_date: z.string().nullable().optional(),
});


export const upsertProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => projectInput.parse(d))
  .handler(async ({ data, context }) => {
    const payload: any = { ...data, owner_id: context.userId };
    if (!data.id) {
      const { resolveOrganizationId } = await import("@/lib/org/resolve");
      const orgId = await resolveOrganizationId(context.supabase as never, context.userId);
      if (orgId) payload.organization_id = orgId;
    }
    const q = data.id
      ? context.supabase.from("projects").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("projects").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { project: row as ProjectRow };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------- Dashboard payload ----------
function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export const getProjectDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { id } = data;
    const { data: project, error } = await context.supabase
      .from("projects")
      .select("*, clients(id, name, company)")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);

    const [
      tasksRes,
      milestonesRes,
      membersRes,
      risksRes,
      notesRes,
      costsRes,
      financesRes,
      activityRes,
      filesRes,
    ] = await Promise.all([
      context.supabase.from("tasks").select("*").eq("project_id", id),
      context.supabase
        .from("project_milestones")
        .select("*")
        .eq("project_id", id)
        .order("position", { ascending: true }),
      context.supabase.from("project_members").select("*").eq("project_id", id),
      context.supabase
        .from("project_risks")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      context.supabase.from("project_notes").select("*").eq("project_id", id).maybeSingle(),
      context.supabase
        .from("project_costs")
        .select("*")
        .eq("project_id", id)
        .order("incurred_at", { ascending: false }),
      context.supabase.from("finances").select("*").eq("project_id", id),
      context.supabase
        .from("project_activity")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("files")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
    ]);

    const tasks = tasksRes.data ?? [];
    const finances = financesRes.data ?? [];
    const costs = costsRes.data ?? [];
    const risks = risksRes.data ?? [];

    const now = new Date();
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t: any) => t.status === "concluido").length;
    const overdueTasks = tasks.filter(
      (t: any) => t.status !== "concluido" && t.due_date && new Date(t.due_date) < now,
    ).length;
    const progress = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : (project as any).progress ?? 0;

    const revenueReceived = finances
      .filter((f: any) => f.kind === "receber" && f.status === "quitado")
      .reduce((s: number, f: any) => s + Number(f.amount), 0);
    const revenuePending = finances
      .filter((f: any) => f.kind === "receber" && f.status !== "quitado")
      .reduce((s: number, f: any) => s + Number(f.amount), 0);
    const totalCost = costs.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const contractValue = Number((project as any).contract_value ?? (project as any).value ?? 0);
    const profit = revenueReceived - totalCost;
    const margin = revenueReceived > 0 ? (profit / revenueReceived) * 100 : 0;
    const budgetUsage = contractValue > 0 ? (totalCost / contractValue) * 100 : 0;

    const dueDate = (project as any).due_date ? new Date((project as any).due_date) : null;
    const daysRemaining = dueDate
      ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000)
      : null;

    const openCritical = risks.filter(
      (r: any) => r.severity === "critical" && r.status === "open",
    ).length;

    // Health
    let healthScore = 100;
    if (overdueTasks > 0) healthScore -= Math.min(30, overdueTasks * 5);
    if (budgetUsage > 80) healthScore -= 20;
    if (budgetUsage > 100) healthScore -= 20;
    if (daysRemaining !== null && daysRemaining < 7) healthScore -= 15;
    if (daysRemaining !== null && daysRemaining < 0) healthScore -= 20;
    if (openCritical > 0) healthScore -= openCritical * 15;
    healthScore = Math.max(0, Math.min(100, healthScore));
    const health: "healthy" | "attention" | "critical" =
      healthScore >= 75 ? "healthy" : healthScore >= 45 ? "attention" : "critical";

    // Alerts
    const alerts: { type: string; message: string; severity: "warning" | "danger" }[] = [];
    if (overdueTasks > 0)
      alerts.push({
        type: "overdue",
        message: `${overdueTasks} tarefa(s) atrasada(s)`,
        severity: "danger",
      });
    if (budgetUsage > 80)
      alerts.push({
        type: "budget",
        message: `Orçamento em ${Math.round(budgetUsage)}% do contrato`,
        severity: budgetUsage > 100 ? "danger" : "warning",
      });
    if (daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7)
      alerts.push({
        type: "deadline",
        message: `Prazo em ${daysRemaining} dia(s)`,
        severity: "warning",
      });
    if (openCritical > 0)
      alerts.push({
        type: "risk",
        message: `${openCritical} bloqueio(s) crítico(s) abertos`,
        severity: "danger",
      });

    // Today's focus
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayTasks = tasks.filter((t: any) => {
      if (!t.due_date) return false;
      const dd = new Date(t.due_date);
      return dd >= today && dd < tomorrow;
    });

    // Weekly
    const weekStart = startOfWeek();
    const completedThisWeek = tasks.filter(
      (t: any) => t.completed_at && new Date(t.completed_at) >= weekStart,
    );
    const newThisWeek = tasks.filter((t: any) => new Date(t.created_at) >= weekStart);
    const overdueList = tasks.filter(
      (t: any) => t.status !== "concluido" && t.due_date && new Date(t.due_date) < now,
    );

    // Monthly chart data — last 30 days
    const chartDays: { date: string; completed: number; created: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const key = d.toISOString().slice(0, 10);
      const completed = tasks.filter(
        (t: any) => t.completed_at && new Date(t.completed_at) >= d && new Date(t.completed_at) < next,
      ).length;
      const created = tasks.filter(
        (t: any) => new Date(t.created_at) >= d && new Date(t.created_at) < next,
      ).length;
      chartDays.push({ date: key, completed, created });
    }

    // Execution panel: today / overdue / waiting-client
    const execution = {
      today: todayTasks,
      overdue: overdueList,
      waitingClient: tasks.filter(
        (t: any) => t.status === "em_revisao" || (project as any).status === "aguardando_cliente",
      ),
    };

    // Planned vs Actual — weekly buckets between start_date and due_date (or last 12 weeks)
    const startD = (project as any).start_date ? new Date((project as any).start_date) : null;
    const endD = (project as any).due_date ? new Date((project as any).due_date) : null;
    const plannedVsActual: { week: string; planned: number; actual: number }[] = [];
    if (startD && endD && endD > startD && totalTasks > 0) {
      const weeks = Math.max(2, Math.ceil((endD.getTime() - startD.getTime()) / (7 * 86400000)));
      for (let i = 0; i <= weeks; i++) {
        const wd = new Date(startD);
        wd.setDate(wd.getDate() + i * 7);
        const planned = Math.min(100, Math.round((i / weeks) * 100));
        const actualDone = tasks.filter(
          (t: any) => t.completed_at && new Date(t.completed_at) <= wd,
        ).length;
        const actual = wd > now ? 0 : Math.round((actualDone / totalTasks) * 100);
        plannedVsActual.push({
          week: wd.toISOString().slice(5, 10),
          planned,
          actual: wd > now && i > 0 ? plannedVsActual[i - 1]?.actual ?? 0 : actual,
        });
      }
    }

    // Upcoming deliveries 7/15/30
    const horizon = (days: number) => {
      const limit = new Date(today);
      limit.setDate(limit.getDate() + days);
      const inTasks = tasks
        .filter((t: any) => t.due_date && t.status !== "concluido" && new Date(t.due_date) >= today && new Date(t.due_date) <= limit)
        .map((t: any) => ({ kind: "task" as const, id: t.id, title: t.title, due_date: t.due_date }));
      const inMilestones = (milestonesRes.data ?? [])
        .filter((m: any) => m.due_date && m.status !== "done" && new Date(m.due_date) >= today && new Date(m.due_date) <= limit)
        .map((m: any) => ({ kind: "milestone" as const, id: m.id, title: m.title, due_date: m.due_date }));
      return [...inTasks, ...inMilestones].sort(
        (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
      );
    };
    const upcomingDeliveries = { in7: horizon(7), in15: horizon(15), in30: horizon(30) };

    // Kanban counts (by canonical task status)
    const kanbanCounts: Record<string, number> = {
      a_fazer: 0, em_andamento: 0, em_revisao: 0, concluido: 0, cancelado: 0,
    };
    tasks.forEach((t: any) => {
      const k = String(t.status ?? "a_fazer");
      kanbanCounts[k] = (kanbanCounts[k] ?? 0) + 1;
    });

    // Finance monthly — last 6 months
    const financeMonthly: { month: string; revenue: number; cost: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const revenue = finances
        .filter((f: any) => f.kind === "receber" && f.status === "quitado" && f.created_at && new Date(f.created_at) >= d && new Date(f.created_at) < next)
        .reduce((s: number, f: any) => s + Number(f.amount), 0);
      const cost = costs
        .filter((c: any) => c.incurred_at && new Date(c.incurred_at) >= d && new Date(c.incurred_at) < next)
        .reduce((s: number, c: any) => s + Number(c.amount), 0);
      financeMonthly.push({ month: d.toLocaleDateString("pt-BR", { month: "short" }), revenue, cost });
    }

    const nextMilestone = (milestonesRes.data ?? []).find((m: any) => m.status !== "done") ?? null;

    // ---------- Commercial block ----------
    const p: any = project;
    const model: string = p.commercial_model ?? "projeto_fechado";
    const hoursWorked = (tasks as any[]).reduce((s, t: any) => {
      const minutes = Number(t.time_spent_minutes ?? 0);
      const legacy = Number(t.actual_hours ?? 0) * 60;
      return s + (minutes > 0 ? minutes : legacy);
    }, 0) / 60;
    const hoursContracted = Number(p.contracted_hours ?? 0);
    const hoursRemaining = Math.max(0, hoursContracted - hoursWorked);
    const hourlyRate = Number(p.hourly_rate ?? 0);
    const monthlyValue = Number(p.monthly_value ?? 0);
    const billableValue = hourlyRate > 0 ? hoursWorked * hourlyRate : 0;

    const recurringFinances = finances.filter((f: any) => f.kind === "receber");
    const monthsPaid = recurringFinances.filter((f: any) => f.status === "quitado").length;
    const monthsPending = recurringFinances.filter((f: any) => f.status !== "quitado").length;
    const nextBilling = p.next_billing_date ?? recurringFinances
      .filter((f: any) => f.status !== "quitado" && f.due_date)
      .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0]?.due_date ?? null;

    const commercial = {
      model,
      serviceType: p.service_type ?? null,
      contractValue,
      monthlyValue,
      hourlyRate,
      hoursWorked: Math.round(hoursWorked * 100) / 100,
      hoursContracted,
      hoursRemaining: Math.round(hoursRemaining * 100) / 100,
      billableValue,
      monthsPaid,
      monthsPending,
      nextBilling,
      revenue: revenueReceived,
      pending: revenuePending,
      costs: totalCost,
      profit,
      margin,
    };


    return {
      project: { ...project, client: (project as any).clients },
      kpis: {
        progress,
        totalTasks,
        doneTasks,
        overdueTasks,
        revenueReceived,
        revenuePending,
        totalCost,
        contractValue,
        profit,
        margin,
        budgetUsage,
        daysRemaining,
        openIssues: risks.filter((r: any) => r.status === "open").length,
        memberCount: (membersRes.data ?? []).length,
      },
      health,
      healthScore,
      alerts,
      tasks,
      todayTasks,
      weekly: {
        completed: completedThisWeek,
        overdue: overdueList,
        created: newThisWeek,
      },
      chartDays,
      execution,
      plannedVsActual,
      upcomingDeliveries,
      kanbanCounts,
      financeMonthly,
      nextMilestone,
      commercial,
      milestones: milestonesRes.data ?? [],

      members: membersRes.data ?? [],
      risks,
      notes: notesRes.data,
      costs,
      finances,
      activity: activityRes.data ?? [],
      files: filesRes.data ?? [],
    };
  });

// ---------- Milestones ----------
const milestoneInput = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(["pending", "in_progress", "done"]).default("pending"),
  due_date: z.string().nullable().optional(),
  position: z.number().int().default(0),
});

export const upsertMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => milestoneInput.parse(d))
  .handler(async ({ data, context }) => {
    const { orgFieldsFromRow } = await import("@/lib/org/resolve");
    const payload: any = {
      ...data,
      owner_id: context.userId,
      ...(await orgFieldsFromRow(context.supabase as never, "projects", data.project_id)),
      completed_at: data.status === "done" ? new Date().toISOString() : null,
    };
    const q = data.id
      ? context.supabase
          .from("project_milestones")
          .update(payload)
          .eq("id", data.id)
          .select()
          .single()
      : context.supabase.from("project_milestones").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { milestone: row };
  });

export const deleteMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_milestones").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------- Members ----------
export const upsertMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        project_id: z.string().uuid(),
        name: z.string().min(1).max(200),
        role: z.string().max(120).nullable().optional(),
        email: z.string().email().max(255).nullable().optional().or(z.literal("").transform(() => null)),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { orgFieldsFromRow } = await import("@/lib/org/resolve");
    const payload: any = {
      ...data,
      owner_id: context.userId,
      ...(await orgFieldsFromRow(context.supabase as never, "projects", data.project_id)),
    };
    const q = data.id
      ? context.supabase.from("project_members").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("project_members").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { member: row };
  });

export const deleteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_members").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------- Risks ----------
export const upsertRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        project_id: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().optional(),
        severity: z.enum(["low", "medium", "high", "critical"]),
        status: z.enum(["open", "mitigated", "resolved"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { orgFieldsFromRow } = await import("@/lib/org/resolve");
    const payload: any = {
      ...data,
      owner_id: context.userId,
      ...(await orgFieldsFromRow(context.supabase as never, "projects", data.project_id)),
    };
    const q = data.id
      ? context.supabase.from("project_risks").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("project_risks").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { risk: row };
  });

export const deleteRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_risks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------- Costs ----------
export const upsertCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        project_id: z.string().uuid(),
        kind: z.enum(["internal", "external"]),
        category: z.string().max(120).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        amount: z.number().nonnegative(),
        incurred_at: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { orgFieldsFromRow } = await import("@/lib/org/resolve");
    const payload: any = {
      ...data,
      owner_id: context.userId,
      ...(await orgFieldsFromRow(context.supabase as never, "projects", data.project_id)),
    };
    const q = data.id
      ? context.supabase.from("project_costs").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("project_costs").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return { cost: row };
  });

export const deleteCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_costs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------- Notes ----------
export const saveProjectNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        project_id: z.string().uuid(),
        content_html: z.string().max(200000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_notes")
      .upsert(
        { project_id: data.project_id, content_html: data.content_html, owner_id: context.userId },
        { onConflict: "project_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------- Recurring invoice (mensal_recorrente / suporte_continuo) ----------
export const generateRecurringInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      amount: z.number().positive().optional(),
      description: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: proj, error: pErr } = await context.supabase
      .from("projects")
      .select("id, name, client_id, monthly_value, billing_day, next_billing_date, commercial_model")
      .eq("id", data.project_id)
      .single();
    if (pErr) throw new Error(pErr.message);
    const p: any = proj;
    const isRecurring = ["mensal_recorrente", "suporte_continuo"].includes(p.commercial_model);
    const amount = Number(data.amount ?? p.monthly_value ?? 0);
    if (!amount) throw new Error("Informe um valor para a cobrança");

    const today = new Date();
    const base = isRecurring && p.next_billing_date ? new Date(p.next_billing_date) : today;
    const dueIso = base.toISOString().slice(0, 10);

    const { orgFieldsFromRow: orgFromProj } = await import("@/lib/org/resolve");
    const { error: fErr } = await context.supabase.from("finances").insert({
      owner_id: context.userId,
      ...(await orgFromProj(context.supabase as never, "projects", p.id)),
      project_id: p.id,
      client_id: p.client_id,
      kind: "receber",
      description: data.description ?? `Cobrança — ${p.name}`,
      amount,
      due_date: dueIso,
      status: "aberto",
    });
    if (fErr) throw new Error(fErr.message);

    if (isRecurring) {
      const next = new Date(base);
      next.setMonth(next.getMonth() + 1);
      const nextIso = next.toISOString().slice(0, 10);
      await context.supabase
        .from("projects")
        .update({ next_billing_date: nextIso })
        .eq("id", p.id);
      return { ok: true as const, due_date: dueIso, next_billing_date: nextIso };
    }
    return { ok: true as const, due_date: dueIso, next_billing_date: null };
  });

// ---------- Project finance entries (reuses `finances` table) ----------
export const listProjectFinances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("finances")
      .select("id, kind, description, amount, due_date, paid_at, status, recurrence, payment_method")
      .eq("project_id", data.project_id)
      .order("due_date", { ascending: false });
    if (error) throw new Error(error.message);
    const items = (rows ?? []) as any[];
    let revenue = 0, expense = 0;
    for (const r of items) {
      const amt = Number(r.amount) || 0;
      if (r.status === "quitado") {
        if (r.kind === "receber") revenue += amt;
        else expense += amt;
      }
    }
    return { items, totals: { revenue, expense, balance: revenue - expense } };
  });

const financeEntrySchema = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid(),
  kind: z.enum(["receber", "pagar"]),
  periodicity: z.enum(["diaria", "mensal"]),
  description: z.string().max(500).optional().nullable(),
  amount: z.number().positive(),
  due_date: z.string().min(8),
  status: z.enum(["aberto", "quitado"]),
  payment_method: z.string().max(80).optional().nullable(),
  installments: z.number().int().min(1).max(60).optional(),
  installment_mode: z.enum(["split", "fixed"]).optional(),
});

export const upsertProjectFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => financeEntrySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: proj, error: pErr } = await context.supabase
      .from("projects")
      .select("id, client_id")
      .eq("id", data.project_id)
      .single();
    if (pErr) throw new Error(pErr.message);

    const { orgFieldsFromRow } = await import("@/lib/org/resolve");
    const basePayload: any = {
      owner_id: context.userId,
      ...(await orgFieldsFromRow(context.supabase as never, "projects", data.project_id)),
      project_id: data.project_id,
      client_id: (proj as any).client_id,
      kind: data.kind,
      description: data.description ?? null,
      status: data.status,
      payment_method: data.payment_method ?? null,
      recurrence: data.periodicity === "mensal" ? "monthly" : "none",
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("finances").update({
          ...basePayload,
          amount: data.amount,
          due_date: data.due_date,
          paid_at: data.status === "quitado" ? new Date().toISOString() : null,
        }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true as const, id: data.id };
    }

    const n = Math.max(1, data.installments ?? 1);
    if (n === 1) {
      const { data: ins, error } = await context.supabase
        .from("finances").insert({
          ...basePayload,
          amount: data.amount,
          due_date: data.due_date,
          paid_at: data.status === "quitado" ? new Date().toISOString() : null,
        }).select("id").single();
      if (error) throw new Error(error.message);
      return { ok: true as const, id: (ins as any).id };
    }

    const perAmount = data.installment_mode === "fixed"
      ? data.amount
      : Math.round((data.amount / n) * 100) / 100;
    const base = new Date(data.due_date);
    const rows = Array.from({ length: n }, (_, i) => {
      const d = new Date(base);
      d.setMonth(d.getMonth() + i);
      return {
        ...basePayload,
        amount: perAmount,
        due_date: d.toISOString().slice(0, 10),
        installment_no: i + 1,
        installment_total: n,
        description: data.description
          ? `${data.description} (${i + 1}/${n})`
          : `Parcela ${i + 1}/${n}`,
        paid_at: null,
        status: "aberto",
      };
    });
    const { error } = await context.supabase.from("finances").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true as const, id: null };
  });


export const deleteProjectFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("finances").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------- Roadmap stages ----------
const stageSchema = z.object({
  name: z.string().trim().min(1).max(80),
  done: z.boolean(),
});

export const updateRoadmapStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      project_id: z.string().uuid(),
      stages: z.array(stageSchema).min(1).max(20),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ roadmap_stages: data.stages })
      .eq("id", data.project_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
