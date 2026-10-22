import type { Tables } from "@/integrations/supabase/types";
import type { PendingPriority } from "@/lib/tasks/pending";

export type LeadScheduledTask = Tables<"lead_tasks"> & {
  /** Coluna criada na migração 21; antes dela o agendamento conta como média. */
  priority?: PendingPriority | null;
  leads: Pick<Tables<"leads">, "id" | "name" | "converted_client_id" | "converted_project_id">;
};

export function leadTaskDisplay(task: LeadScheduledTask) {
  return {
    id: `lead:${task.id}`,
    title: task.title,
    description: task.notes,
    status: task.done ? "concluido" : "a_fazer",
    priority: (task.priority ?? "media") as PendingPriority,
    project_id: task.leads.converted_project_id,
    client_id: task.leads.converted_client_id,
    due_date: task.due_at,
    created_at: task.created_at,
    position: 0,
    briefing: { type: task.kind },
    leadTask: task,
  };
}
