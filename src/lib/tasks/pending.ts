import { format, isValid, parseISO } from "date-fns";

export type PendingPriority = "baixa" | "media" | "alta" | "critica";

/** Alta e Urgente (critica) contam como prioritárias para avisos e menu. */
export const PRIORITY_LEVELS: PendingPriority[] = ["alta", "critica"];

export function isPriorityLevel(priority: string | null | undefined): boolean {
  return priority === "alta" || priority === "critica";
}

export function isDoneStatus(status: string | null | undefined): boolean {
  return status === "concluido" || status === "cancelado";
}

/**
 * Datas gravadas à meia-noite UTC são "dia inteiro": vale o dia gravado, sem fuso.
 * As demais seguem o dia local do usuário.
 */
export function dueDayKey(due: string | null | undefined): string | null {
  if (!due) return null;
  const d = parseISO(due);
  if (!isValid(d)) return null;
  const allDay = /T00:00(:00(\.0+)?)?(Z|\+00:?00)?$/.test(due) || /^\d{4}-\d{2}-\d{2}$/.test(due);
  return allDay ? due.slice(0, 10) : format(d, "yyyy-MM-dd");
}

/** Atrasada: prazo num dia anterior a hoje e ainda não concluída. */
export function isOverdue(
  item: { due_date: string | null; status?: string | null },
  now: Date = new Date(),
): boolean {
  if (isDoneStatus(item.status)) return false;
  const key = dueDayKey(item.due_date);
  if (!key) return false;
  return key < format(now, "yyyy-MM-dd");
}

export type AlertItem = { source: "task" | "lead"; id: string };

export const alertKey = (a: AlertItem) => `${a.source}:${a.id}`;

/** Itens que ainda não receberam CIENTE. */
export function unackedAlerts<T extends AlertItem>(items: T[], acked: Iterable<string>): T[] {
  const set = new Set(acked);
  return items.filter((i) => !set.has(alertKey(i)));
}
