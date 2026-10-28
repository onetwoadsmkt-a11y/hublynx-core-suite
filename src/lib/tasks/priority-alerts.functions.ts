import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { alertKey, type AlertItem } from "./pending";

export type PriorityAlert = AlertItem & {
  title: string;
  priority: "alta" | "critica";
  due: string | null;
  leadId: string | null;
  leadName: string | null;
  /** tarefa de projeto: o aviso abre a tarefa na etapa */
  projectId?: string | null;
};

const PRIORITIES = ["alta", "critica"];

/**
 * Tarefas Alta/Urgente pendentes sob responsabilidade do usuário na empresa ativa:
 * tarefas gerais em que ele é o responsável (ou o dono, quando não há responsável)
 * e agendamentos de lead que ele criou. Tudo com o RLS de quem pede.
 */
export const listPriorityAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const items: PriorityAlert[] = [];

    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id, title, priority, due_date, status, assignee_id, owner_id, project_id")
      .eq("organization_id" as any, data.organizationId)
      .in("priority", PRIORITIES as any)
      .not("status", "in", "(concluido,cancelado)")
      .or(`assignee_id.eq.${userId},and(assignee_id.is.null,owner_id.eq.${userId})`)
      .limit(200);
    if (tasksError) throw new Error(tasksError.message);
    for (const t of tasks ?? []) {
      items.push({
        source: "task",
        id: t.id as string,
        title: t.title as string,
        priority: t.priority as "alta" | "critica",
        due: (t.due_date as string | null) ?? null,
        leadId: null,
        leadName: null,
        projectId: ((t as any).project_id as string | null) ?? null,
      });
    }

    // Agendamentos de lead: a coluna priority chega com a migração 21.
    const { data: leadTasks, error: leadError } = await supabase
      .from("lead_tasks")
      .select("id, title, priority, due_at, lead_id, leads!inner(name, organization_id)" as any)
      .eq("owner_id", userId)
      .eq("done", false)
      .in("priority" as any, PRIORITIES)
      .eq("leads.organization_id" as any, data.organizationId)
      .limit(200);
    const leadPriorityReady = !leadError;
    for (const lt of (leadTasks ?? []) as any[]) {
      items.push({
        source: "lead",
        id: lt.id,
        title: lt.title,
        priority: lt.priority,
        due: lt.due_at ?? null,
        leadId: lt.lead_id,
        leadName: lt.leads?.name ?? null,
      });
    }

    // Urgente primeiro, depois pelo prazo (sem prazo por último).
    items.sort((a, b) =>
      (a.priority === b.priority ? 0 : a.priority === "critica" ? -1 : 1) ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999"));

    // Confirmações "CIENTE" (tabela da migração 21).
    const { data: acks, error: acksError } = await supabase
      .from("task_priority_acks" as any)
      .select("source, item_id")
      .eq("user_id", userId);
    const acked = acksError ? [] : ((acks ?? []) as any[]).map((a) => alertKey({ source: a.source, id: a.item_id }));

    return { items, acked, acksAvailable: !acksError, leadPriorityReady };
  });

/** Registra o "CIENTE" do usuário para os avisos mostrados. */
export const ackPriorityAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        items: z.array(z.object({ source: z.enum(["task", "lead"]), id: z.string().uuid() })).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const rows = data.items.map((i) => ({
      user_id: context.userId,
      source: i.source,
      item_id: i.id,
      organization_id: data.organizationId,
      acked_at: new Date().toISOString(),
    }));
    const { error } = await context.supabase
      .from("task_priority_acks" as any)
      .upsert(rows as any, { onConflict: "user_id,source,item_id" });
    if (error) return { ok: false as const, stored: false as const, error: error.message };
    return { ok: true as const, stored: true as const };
  });
