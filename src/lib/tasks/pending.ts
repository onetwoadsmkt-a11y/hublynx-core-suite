import { isValid, parseISO } from "date-fns";

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
  return allDay ? due.slice(0, 10) : dayKey(d);
}

/** Dia (aaaa-mm-dd) no horário de Brasília — igual no navegador e no servidor (UTC). */
const TZ = "America/Sao_Paulo";
export function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function clock(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(d);
}

/**
 * O prazo tem horário marcado? Prazos "só com dia" são gravados como data pura,
 * meia-noite (UTC ou local) ou meio-dia (convenção usada nas tarefas dos projetos).
 */
export function dueHasTime(due: string | null | undefined): boolean {
  if (!due || /^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  const d = parseISO(due);
  if (!isValid(d)) return false;
  if (/T(00|12):00(:00(\.0+)?)?(Z|[+-]00:?00)?$/.test(due)) return false;
  const dayOnly = (c: string) => c === "00:00:00" || c === "12:00:00";
  return !dayOnly(clock(d)) && !dayOnly(clock(d, TZ));
}

/**
 * Atrasada (ainda não concluída):
 * - com horário marcado (ex.: hoje às 17:42) → assim que o horário passa;
 * - só com dia → a partir do dia seguinte.
 */
export function isOverdue(
  item: { due_date: string | null; status?: string | null },
  now: Date = new Date(),
): boolean {
  if (isDoneStatus(item.status)) return false;
  const key = dueDayKey(item.due_date);
  if (!key) return false;
  if (dueHasTime(item.due_date)) return parseISO(item.due_date!).getTime() < now.getTime();
  return key < dayKey(now);
}

/** Prazo cai hoje (no dia local) e ainda não está atrasado. */
export function isDueToday(item: { due_date: string | null; status?: string | null }, now: Date = new Date()): boolean {
  if (isDoneStatus(item.status) || isOverdue(item, now)) return false;
  return dueDayKey(item.due_date) === dayKey(now);
}

export type AlertItem = { source: "task" | "lead"; id: string };

export const alertKey = (a: AlertItem) => `${a.source}:${a.id}`;

/** Itens que ainda não receberam CIENTE. */
export function unackedAlerts<T extends AlertItem>(items: T[], acked: Iterable<string>): T[] {
  const set = new Set(acked);
  return items.filter((i) => !set.has(alertKey(i)));
}
