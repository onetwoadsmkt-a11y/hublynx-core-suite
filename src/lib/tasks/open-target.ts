/**
 * Para onde vai "Abrir tarefa" fora do projeto (Agenda, lista do dia):
 * - agendamento de lead ("lead:<id>") → janela do agendamento (com o card do lead);
 * - tarefa ligada a projeto → a própria tarefa dentro da etapa do projeto;
 * - tarefa solta → janela com os detalhes da tarefa.
 */
export type OpenTarget =
  | { kind: "lead"; id: string }
  | { kind: "project"; projectId: string; taskId: string }
  | { kind: "task"; id: string };

export function openTargetFor(
  id: string,
  item?: { project_id?: string | null; leadTask?: unknown | null } | null,
): OpenTarget {
  if (id.startsWith("lead:") || item?.leadTask) return { kind: "lead", id };
  if (item?.project_id) return { kind: "project", projectId: item.project_id, taskId: id };
  return { kind: "task", id };
}
