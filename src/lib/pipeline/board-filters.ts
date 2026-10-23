import type { TaskStat } from "./report-filters";

/**
 * Filtros do cabeçalho do Pipeline (estilo Kommo): período, origem, etapa,
 * temperatura, tags e tarefas. Dentro de cada grupo vale "qualquer um" (OU);
 * entre grupos, todos precisam bater (E).
 */
export type Temperature = "quente" | "morno" | "frio";
export type PeriodPreset = "todos" | "hoje" | "ontem" | "7" | "30" | "90" | "mes" | "custom";
export type TaskFilter = "agendadas" | "hoje" | "atrasadas" | "sem";
export type OriginKind = "source" | "utm_source" | "utm_medium" | "utm_campaign" | "anuncio";

export type BoardFilters = {
  period: PeriodPreset;
  from: string; // yyyy-mm-dd (custom)
  to: string;
  origins: string[]; // "<kind>:<valor em minúsculas>"
  stageIds: string[];
  temperatures: Temperature[];
  tags: string[];
  tagMode: "any" | "all";
  tasks: TaskFilter[];
};

export const EMPTY_BOARD_FILTERS: BoardFilters = {
  period: "todos", from: "", to: "", origins: [], stageIds: [], temperatures: [], tags: [], tagMode: "any", tasks: [],
};

export function activeFilterCount(f: BoardFilters) {
  return (f.period !== "todos" ? 1 : 0) + f.origins.length + f.stageIds.length + f.temperatures.length + f.tags.length + f.tasks.length;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Intervalo de dias (local, inclusivo) do período escolhido; null = sem limite. */
export function periodRange(f: Pick<BoardFilters, "period" | "from" | "to">, now = new Date()): { from: string; to: string } | null {
  const today = iso(now);
  const back = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return iso(d); };
  switch (f.period) {
    case "hoje": return { from: today, to: today };
    case "ontem": return { from: back(1), to: back(1) };
    case "7": return { from: back(6), to: today };
    case "30": return { from: back(29), to: today };
    case "90": return { from: back(89), to: today };
    case "mes": return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "custom":
      if (!f.from && !f.to) return null;
      return { from: f.from || "0000-01-01", to: f.to || "9999-12-31" };
    default: return null;
  }
}

export type OriginLead = {
  source?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
};

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Chaves de origem de um lead (um lead pode ter fonte + UTMs + anúncio). */
export function originKeys(l: OriginLead): string[] {
  const out: string[] = [];
  if (norm(l.source)) out.push(`source:${norm(l.source)}`);
  if (norm(l.utm_source)) out.push(`utm_source:${norm(l.utm_source)}`);
  if (norm(l.utm_medium)) out.push(`utm_medium:${norm(l.utm_medium)}`);
  if (norm(l.utm_campaign)) out.push(`utm_campaign:${norm(l.utm_campaign)}`);
  if (l.gclid) out.push("anuncio:google");
  if (l.fbclid) out.push("anuncio:meta");
  if (!out.length) out.push("source:");
  return out;
}

export type OriginOption = { key: string; kind: OriginKind; label: string; count: number };

/** Opções de origem existentes nos leads, com contagem, agrupadas por tipo. */
export function originOptions(leads: OriginLead[]): OriginOption[] {
  const map = new Map<string, OriginOption>();
  for (const l of leads) {
    const raw: Record<string, string | null | undefined> = {
      source: l.source, utm_source: l.utm_source, utm_medium: l.utm_medium, utm_campaign: l.utm_campaign,
    };
    for (const key of originKeys(l)) {
      const [kind, value] = key.split(/:(.*)/s) as [OriginKind, string];
      const cur = map.get(key);
      if (cur) { cur.count++; continue; }
      const label = kind === "anuncio"
        ? value === "google" ? "Anúncio Google (gclid)" : "Anúncio Meta (fbclid)"
        : value === "" ? "Sem origem" : (raw[kind] ?? value).trim();
      map.set(key, { key, kind, label, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export type BoardLead = OriginLead & {
  id: string;
  stage_id?: string | null;
  created_at?: string | null;
  tags?: string[] | null;
};

export function applyBoardFilters<L extends BoardLead>(
  leads: L[],
  f: BoardFilters,
  ctx: { stats: Map<string, TaskStat>; temperatureOf: (l: L) => Temperature | null; now?: Date },
): L[] {
  const now = ctx.now ?? new Date();
  const range = periodRange(f, now);
  const wantTags = f.tags.map((t) => t.toLowerCase());
  const origins = new Set(f.origins);
  const today = iso(now);

  return leads.filter((l) => {
    if (range) {
      if (!l.created_at) return false;
      const day = iso(new Date(l.created_at));
      if (day < range.from || day > range.to) return false;
    }
    if (f.stageIds.length && (!l.stage_id || !f.stageIds.includes(l.stage_id))) return false;
    if (f.temperatures.length) {
      const t = ctx.temperatureOf(l);
      if (!t || !f.temperatures.includes(t)) return false;
    }
    if (origins.size && !originKeys(l).some((k) => origins.has(k))) return false;
    if (wantTags.length) {
      const has = new Set((l.tags ?? []).map((t) => String(t).toLowerCase()));
      const ok = f.tagMode === "all" ? wantTags.every((t) => has.has(t)) : wantTags.some((t) => has.has(t));
      if (!ok) return false;
    }
    if (f.tasks.length) {
      const s = ctx.stats.get(l.id);
      const open = s?.open ?? 0;
      const ok = f.tasks.some((k) =>
        k === "agendadas" ? open > 0
          : k === "atrasadas" ? (s?.overdue ?? 0) > 0
            : k === "hoje" ? !!s?.next && iso(new Date(s.next)) === today
              : open === 0,
      );
      if (!ok) return false;
    }
    return true;
  });
}
