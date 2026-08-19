/** Formatação de datas do módulo Financeiro. ISO fica só no banco. */

/** "2026-03-03" | Date → "03/03/2026" */
export function formatDateBR(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value.slice(0, 10) + "T00:00:00") : value;
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** "2026-03" → "03/2026" */
export function formatCompetenciaBR(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m] = value.split("-");
  return m ? `${m}/${y}` : value;
}
