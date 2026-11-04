import { dayKey, dueDayKey, dueHasTime } from "@/lib/tasks/pending";

/**
 * Prazo das tarefas — regra única para gravar e mostrar (sempre no horário de Brasília):
 * - só com dia → meia-noite UTC do dia (`aaaa-mm-ddT00:00:00.000Z`, "dia inteiro");
 * - com hora   → o horário em Brasília convertido para ISO.
 * Brasília não tem horário de verão desde 2019, então o fuso é fixo (-03:00).
 */
const BRT_OFFSET = "-03:00";
const TZ = "America/Sao_Paulo";

/** Data (aaaa-mm-dd) + hora opcional (HH:mm) → valor gravado em due_date/due_at. */
export function dueFromParts(date: string, time?: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!time) return `${date}T00:00:00.000Z`;
  const d = new Date(`${date}T${time.slice(0, 5)}:00${BRT_OFFSET}`);
  if (Number.isNaN(d.getTime())) return null;
  // 21:00, 00:00, 09:00 e 12:00 coincidem com os marcadores de "dia inteiro":
  // +1 segundo mantém o horário escolhido (a tela mostra só HH:mm).
  if (!dueHasTime(d.toISOString())) d.setSeconds(1);
  return d.toISOString();
}

/** Agendamento de lead sem hora: 09:00 de Brasília, tratado como "do dia". */
export function leadDueFromParts(date: string, time?: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return time ? dueFromParts(date, time) : `${date}T12:00:00.000Z`;
}

/** Valor gravado → campos do formulário (data e hora em Brasília; hora vazia = dia inteiro). */
export function dueToParts(iso: string | null | undefined): { date: string; time: string } {
  const date = dueDayKey(iso) ?? "";
  if (!iso || !date || !dueHasTime(iso)) return { date, time: "" };
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return { date, time };
}

/** Valor para <input type="datetime-local"> no horário de Brasília (dia inteiro → 09:00). */
export function dueToLocalInput(iso: string | null | undefined): string {
  const { date, time } = dueToParts(iso);
  return date ? `${date}T${time || "09:00"}` : "";
}

/** <input type="datetime-local"> (horário de Brasília) → ISO. */
export function localInputToIso(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return m ? dueFromParts(m[1], m[2]) : null;
}

/** "10/11/2026" ou "10/11/2026 · 14:00". */
export function dueLabel(iso: string | null | undefined): string | null {
  const { date, time } = dueToParts(iso);
  if (!date) return null;
  const br = `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  return time ? `${br} · ${time}` : br;
}

/** Hora em Brasília ("14:00") ou null quando o prazo é só o dia. */
export function dueTime(iso: string | null | undefined): string | null {
  return dueToParts(iso).time || null;
}

/** Diferença em dias de calendário (Brasília) entre o prazo e hoje: 0 = hoje, 1 = amanhã, -2 = há 2 dias. */
export function dueDayOffset(iso: string | null | undefined, now: Date = new Date()): number | null {
  const key = dueDayKey(iso);
  if (!key) return null;
  const t = dayKey(now);
  const a = Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  const b = Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
}

/** Data de hoje (aaaa-mm-dd) em Brasília. */
export const todayKeyBR = () => dayKey(new Date());
