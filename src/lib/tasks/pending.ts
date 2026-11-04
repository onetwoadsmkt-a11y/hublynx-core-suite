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
 * meia-noite (UTC ou Brasília) ou meio-dia (UTC ou Brasília — convenções dos projetos).
 * A conferência usa UTC e Brasília explicitamente, então dá o mesmo resultado no
 * navegador e no servidor. Horários escolhidos pela pessoa que caem num desses
 * marcadores são gravados com 1 segundo a mais (`dueFromParts`), para não virarem "dia".
 */
export function dueHasTime(due: string | null | undefined): boolean {
  if (!due || /^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  const d = parseISO(due);
  if (!isValid(d)) return false;
  if (/T(00|12):00(:00(\.0+)?)?(Z|[+-]00:?00)?$/.test(due)) return false;
  const dayOnly = (c: string) => c === "00:00:00" || c === "12:00:00";
  return !dayOnly(clock(d, "UTC")) && !dayOnly(clock(d, TZ));
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

/**
 * Há quantos dias a tarefa está atrasada (0 = venceu hoje, com horário já passado).
 * Retorna null quando não está atrasada.
 */
export function overdueDays(
  item: { due_date: string | null; status?: string | null },
  now: Date = new Date(),
): number | null {
  if (!isOverdue(item, now)) return null;
  const key = dueDayKey(item.due_date)!;
  const a = Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  const t = dayKey(now);
  const b = Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10));
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Texto padrão do destaque vermelho: "Atrasada há 3 dias" / "Atrasada desde 17:42". */
export function overdueLabel(
  item: { due_date: string | null; status?: string | null },
  now: Date = new Date(),
): string | null {
  const days = overdueDays(item, now);
  if (days === null) return null;
  if (days === 0) {
    const hm = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(parseISO(item.due_date!));
    return `Atrasada desde ${hm}`;
  }
  return `Atrasada há ${days} dia${days > 1 ? "s" : ""}`;
}
