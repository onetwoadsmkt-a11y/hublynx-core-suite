import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { scopeOrganization } from "@/lib/org/filter";
import { listLeadScheduledTasks } from "@/lib/pipeline/tasks.functions";
import { leadTaskDisplay, type LeadScheduledTask } from "@/lib/pipeline/task-display";
import type { PendingPriority } from "@/lib/tasks/pending";

/** Item da central de pendências: tarefa geral ou agendamento de lead (id "lead:<id>"). */
export type PendingItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: PendingPriority;
  project_id: string | null;
  client_id: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
  briefing?: any;
  assignee_id?: string | null;
  owner_id?: string | null;
  leadTask?: LeadScheduledTask;
};

export const pendingKeys = {
  tasks: (org: string | null | undefined) => ["tasks", "central", org ?? "none"] as const,
  leadSchedules: (org: string | null | undefined) => ["tasks", "lead-schedules", org ?? "none"] as const,
};

/**
 * Recarrega tudo que mostra pendências: Tarefas, Calendário, Semana, cartão do lead,
 * aviso de prioritárias e contador do menu.
 */
export function invalidatePendingQueries(qc: QueryClient, leadId?: string | null) {
  for (const key of [["tasks"], ["agenda"], ["week"], ["hub-today"], ["priority-alerts"]]) {
    qc.invalidateQueries({ queryKey: key });
  }
  if (leadId) qc.invalidateQueries({ queryKey: ["lead-detail", leadId] });
}

/**
 * Fonte única das pendências da empresa ativa, usada por Tarefas e pelo Calendário.
 * As duas telas compartilham as mesmas chaves de cache, então qualquer mudança
 * aparece nas duas ao mesmo tempo, sem duplicar registros.
 */
export function usePendingItems() {
  const qc = useQueryClient();
  const { activeOrganizationId } = useWorkspace();
  const listSchedules = useServerFn(listLeadScheduledTasks);

  const general = useQuery({
    queryKey: pendingKeys.tasks(activeOrganizationId),
    queryFn: async () => {
      const { data, error } = await scopeOrganization(supabase.from("tasks").select("*"), activeOrganizationId).order("position");
      if (error) throw error;
      return data as PendingItem[];
    },
    staleTime: 60_000,
    enabled: !!activeOrganizationId,
  });

  const schedules = useQuery({
    queryKey: pendingKeys.leadSchedules(activeOrganizationId),
    queryFn: () => {
      if (!activeOrganizationId) throw new Error("Selecione uma empresa.");
      return listSchedules({ data: { organizationId: activeOrganizationId } });
    },
    enabled: !!activeOrganizationId,
    staleTime: 60_000,
  });

  // Mudanças feitas por outra pessoa ou outra aba chegam pelo tempo real.
  useEffect(() => {
    if (!activeOrganizationId) return;
    const name = `pending-live-${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(name)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => invalidatePendingQueries(qc))
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_tasks" }, () => invalidatePendingQueries(qc))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, activeOrganizationId]);

  const items = useMemo<PendingItem[]>(
    () => [...(general.data ?? []), ...(schedules.data ?? []).map((s) => leadTaskDisplay(s) as PendingItem)],
    [general.data, schedules.data],
  );

  return {
    items,
    organizationId: activeOrganizationId,
    isLoading: general.isLoading || schedules.isLoading,
    error: general.error ?? schedules.error ?? null,
    tasksKey: pendingKeys.tasks(activeOrganizationId),
  };
}
