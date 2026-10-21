import type { Tables } from "@/integrations/supabase/types";

export type LeadScheduledTask = Tables<"lead_tasks"> & {
  leads: Pick<Tables<"leads">, "id" | "name" | "converted_client_id" | "converted_project_id">;
};

export function leadTaskDisplay(task: LeadScheduledTask) {
  return {
    id: `lead:${task.id}`,
    title: task.title,
    description: task.notes,
    status: task.done ? "concluido" : "a_fazer",
    priority: "media" as const,
    project_id: task.leads.converted_project_id,
    client_id: task.leads.converted_client_id,
    due_date: task.due_at,
    created_at: task.created_at,
    position: 0,
    briefing: { type: task.kind },
    leadTask: task,
  };
}