/** Data e hora curtas no fuso de São Paulo (ex.: 22/10, 19:50). */
export function stamp(d = new Date()) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Acrescenta uma linha datada às observações do agendamento, sem perder o que já havia. */
export function appendNote(prev: string | null | undefined, text: string, label: string, when = new Date()) {
  const line = `[${stamp(when)}] ${label}${text.trim()}`;
  const base = (prev ?? "").trim();
  return (base ? `${base}\n${line}` : line).slice(-8000);
}

/** Separa as observações em linhas para exibir como histórico do agendamento. */
export function noteLines(notes: string | null | undefined): string[] {
  return (notes ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Sugestão para a próxima ação: próximo dia útil às 10h (formato do campo datetime-local). */
export function defaultNextDue(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}
