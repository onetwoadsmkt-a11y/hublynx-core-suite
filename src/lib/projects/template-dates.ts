/**
 * Modelos de projeto trabalham com datas na tela e guardam deslocamentos no banco
 * (dias a partir do início do projeto), para que o cronograma seja recalculado ao
 * aplicar o modelo em qualquer projeto. Datas no formato yyyy-MM-dd.
 */
const DAY = 86_400_000;
const at = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const isoAdd = (iso: string, n: number) => new Date(at(iso) + n * DAY).toISOString().slice(0, 10);
export const isoDiff = (a: string, b: string) => Math.round((at(a) - at(b)) / DAY);

export type OffsetStage = { start_offset_days: number | null; duration_days: number | null; tasks: { due_offset_days: number }[] };
export type DatedStage = { start: string; end: string; tasks: { due: string }[] };

/**
 * Converte o modelo salvo em datas a partir da data de referência. Mesma regra de
 * aplicar o modelo: com dia inicial, a etapa vai de início até início + duração − 1;
 * sem dia inicial, começa logo depois da anterior.
 */
export function offsetsToDates(ref: string, stages: OffsetStage[]): DatedStage[] {
  let cursor = ref;
  return stages.map((s) => {
    const dur = Math.max(1, s.duration_days ?? 7);
    const start = s.start_offset_days != null ? isoAdd(ref, s.start_offset_days) : cursor;
    const end = isoAdd(start, dur - 1);
    cursor = isoAdd(end, 1);
    return { start, end, tasks: s.tasks.map((t) => ({ due: isoAdd(start, Math.max(0, t.due_offset_days)) })) };
  });
}

/** Converte as datas da tela em deslocamentos (sempre com dia inicial explícito). */
export function datesToOffsets(ref: string, stages: DatedStage[]): OffsetStage[] {
  return stages.map((s) => {
    const start = isoDiff(s.start, ref) < 0 ? ref : s.start;
    const end = isoDiff(s.end, start) < 0 ? start : s.end;
    return {
      start_offset_days: isoDiff(start, ref),
      duration_days: isoDiff(end, start) + 1,
      tasks: s.tasks.map((t) => ({ due_offset_days: Math.max(0, isoDiff(t.due, start)) })),
    };
  });
}
