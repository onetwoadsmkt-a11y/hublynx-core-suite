export type FunnelKey =
  | "entrada"
  | "conectado"
  | "agendada"
  | "realizada"
  | "noshow"
  | "cof"
  | "ganho"
  | "perdido"
  | "nutricao";

export type StageLite = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

export type LeadLite = {
  id: string;
  stage_id: string | null;
  value: number | null;
  source: string | null;
  created_at: string;
  tags?: string[] | null;
};

export type TagLite = {
  slug: string;
  name: string;
  color: string;
  funnel_key: FunnelKey | "nenhum";
  active?: boolean;
};

/** Fonte usada para medir a conversão. */
export type FunnelMode = "both" | "tags" | "stages";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function classifyStage(stage: StageLite): FunnelKey {
  const n = norm(stage.name);
  if (/no.?show/.test(n)) return "noshow";
  if (stage.is_lost || /perdid|desqualific/.test(n)) return "perdido";
  if (stage.is_won || /venda ganha|ganho|fechad/.test(n)) return "ganho";
  if (/nutric/.test(n)) return "nutricao";
  if (/cof|proposta/.test(n)) return "cof";
  if (/reuniao (realizada|feita)|realizad/.test(n)) return "realizada";
  if (/reuniao|agendad/.test(n)) return "agendada";
  if (/contato efetivo|conectad|negocia|qualific/.test(n)) return "conectado";
  return "entrada";
}

/** Ordem do funil (etapas negativas/laterais ficam fora da progressão). */
const ORDER: FunnelKey[] = ["entrada", "conectado", "agendada", "realizada", "cof", "ganho"];

export type FunnelMetrics = {
  leads: number;
  conectados: number;
  agendadas: number;
  realizadas: number;
  noshow: number;
  cof: number;
  ganhos: number;
  perdidos: number;
  nutricao: number;
  valor: number;
  valorGanho: number;
  taxaConexao: number;
  taxaReuniao: number;
  taxaCof: number;
  taxaConversao: number;
  taxaNoShow: number;
};

/** Chaves alcançadas por um lead a partir da etapa em que está. */
function keysFromStage(stage: StageLite | undefined): Set<FunnelKey> {
  const out = new Set<FunnelKey>();
  const kind = stage ? classifyStage(stage) : "entrada";
  if (kind === "perdido" || kind === "nutricao") {
    out.add(kind);
    return out;
  }
  if (kind === "noshow") {
    out.add("noshow");
    out.add("agendada");
    out.add("conectado");
    return out;
  }
  const r = ORDER.indexOf(kind);
  for (let i = 1; i <= r; i++) out.add(ORDER[i]);
  return out;
}

/** Chaves alcançadas pelas tags marcadas manualmente no lead (histórico acumulado). */
function keysFromTags(leadTags: string[] | null | undefined, bySlug: Map<string, TagLite>) {
  const out = new Set<FunnelKey>();
  for (const raw of leadTags ?? []) {
    const t = bySlug.get(String(raw).toLowerCase());
    if (!t || t.active === false) continue;
    if (t.funnel_key === "nenhum") continue;
    out.add(t.funnel_key);
    if (t.funnel_key === "noshow") {
      out.add("agendada");
      out.add("conectado");
    }
  }
  return out;
}

export function computeFunnel(
  stages: StageLite[],
  leads: LeadLite[],
  opts?: { tags?: TagLite[]; mode?: FunnelMode },
): FunnelMetrics {
  const mode: FunnelMode = opts?.mode ?? "both";
  const byId = new Map(stages.map((s) => [s.id, s]));
  const bySlug = new Map((opts?.tags ?? []).map((t) => [t.slug.toLowerCase(), t]));

  const m: FunnelMetrics = {
    leads: leads.length,
    conectados: 0,
    agendadas: 0,
    realizadas: 0,
    noshow: 0,
    cof: 0,
    ganhos: 0,
    perdidos: 0,
    nutricao: 0,
    valor: 0,
    valorGanho: 0,
    taxaConexao: 0,
    taxaReuniao: 0,
    taxaCof: 0,
    taxaConversao: 0,
    taxaNoShow: 0,
  };

  for (const l of leads) {
    const v = Number(l.value ?? 0);
    m.valor += v;

    const reached = new Set<FunnelKey>();
    if (mode !== "tags") {
      for (const k of keysFromStage(l.stage_id ? byId.get(l.stage_id) : undefined)) reached.add(k);
    }
    if (mode !== "stages") {
      for (const k of keysFromTags(l.tags, bySlug)) reached.add(k);
    }

    if (reached.has("perdido")) m.perdidos += 1;
    if (reached.has("nutricao")) m.nutricao += 1;
    if (reached.has("noshow")) m.noshow += 1;
    if (reached.has("conectado")) m.conectados += 1;
    if (reached.has("agendada")) m.agendadas += 1;
    if (reached.has("realizada")) m.realizadas += 1;
    if (reached.has("cof")) m.cof += 1;
    if (reached.has("ganho")) {
      m.ganhos += 1;
      m.valorGanho += v;
    }
  }

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
  m.taxaConexao = pct(m.conectados, m.leads);
  m.taxaReuniao = pct(m.realizadas, m.leads);
  m.taxaCof = pct(m.cof, m.realizadas);
  m.taxaConversao = pct(m.ganhos, m.leads);
  m.taxaNoShow = pct(m.noshow, m.agendadas);
  return m;
}

/** Contagem de leads por tag configurada (para o painel de tags). */
export function countByTag(leads: LeadLite[], tags: TagLite[]) {
  const counts = new Map<string, number>();
  for (const l of leads) {
    for (const raw of l.tags ?? []) {
      const slug = String(raw).toLowerCase();
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return tags.map((t) => ({ ...t, count: counts.get(t.slug.toLowerCase()) ?? 0 }));
}
