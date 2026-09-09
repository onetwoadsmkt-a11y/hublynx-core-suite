import type { FunnelKey } from "./funnel";

export type TagFunnelKey = FunnelKey | "nenhum";

export type PipelineTag = {
  slug: string;
  name: string;
  color: string;
  funnel_key: TagFunnelKey;
  active: boolean;
  position: number;
};

export const TAG_FUNNEL_OPTIONS: { key: TagFunnelKey; label: string }[] = [
  { key: "entrada", label: "Entrada (lead novo)" },
  { key: "conectado", label: "Conectado" },
  { key: "agendada", label: "Reunião agendada" },
  { key: "realizada", label: "Reunião realizada" },
  { key: "noshow", label: "No show" },
  { key: "cof", label: "Proposta / COF" },
  { key: "ganho", label: "Ganho" },
  { key: "perdido", label: "Desqualificado / perdido" },
  { key: "nutricao", label: "Nutrição" },
  { key: "nenhum", label: "Nenhum (só organização)" },
];

export const TAG_COLORS = [
  "#2563eb", "#0ea5e9", "#14b8a6", "#22c55e", "#eab308",
  "#f97316", "#ef4444", "#a855f7", "#64748b", "#0f172a",
];

export function slugifyTag(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const VALID_KEYS = new Set(TAG_FUNNEL_OPTIONS.map((o) => o.key));

export function normalizeTags(raw: unknown): PipelineTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t, i) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const name = String(o.name ?? "").slice(0, 40);
      const slug = String(o.slug ?? slugifyTag(name)).slice(0, 40);
      if (!name || !slug) return null;
      const fk = String(o.funnel_key ?? "nenhum") as TagFunnelKey;
      return {
        slug,
        name,
        color: String(o.color ?? "#64748b"),
        funnel_key: VALID_KEYS.has(fk) ? fk : "nenhum",
        active: o.active !== false,
        position: Number.isFinite(Number(o.position)) ? Number(o.position) : i,
      } satisfies PipelineTag;
    })
    .filter((t): t is PipelineTag => t !== null)
    .sort((a, b) => a.position - b.position);
}
