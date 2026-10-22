export type AgendaSource = "task" | "meeting" | "gcal" | "lead";

export type AgendaEvent = {
  id: string;
  source: AgendaSource;
  title: string;
  start: string; // ISO
  end: string | null; // ISO
  allDay: boolean;
  taskId?: string | null;
  leadId?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  meetLink?: string | null;
  htmlLink?: string | null;
  status?: string | null;
  description?: string | null;
  /** Pendências (tarefas e agendamentos de lead) vindas da fonte compartilhada com Tarefas. */
  priority?: "baixa" | "media" | "alta" | "critica" | null;
  overdue?: boolean;
  leadName?: string | null;
  /** Id do item na central de Tarefas ("<uuid>" ou "lead:<uuid>"). */
  pendingId?: string | null;
};
