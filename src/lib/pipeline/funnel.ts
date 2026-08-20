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
};

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

export function computeFunnel(stages: StageLite[], leads: LeadLite[]): FunnelMetrics {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const kindOf = new Map(stages.map((s) => [s.id, classifyStage(s)]));

  const rankOf = (key: FunnelKey) => ORDER.indexOf(key);

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
    const stage = l.stage_id ? byId.get(l.stage_id) : undefined;
    const kind = stage ? (kindOf.get(stage.id) as FunnelKey) : "entrada";

    if (kind === "perdido") m.perdidos += 1;
    if (kind === "nutricao") m.nutricao += 1;
    if (kind === "noshow") {
      m.noshow += 1;
      m.agendadas += 1;
      m.conectados += 1;
      continue;
    }

    const r = rankOf(kind);
    if (r < 0) continue; // perdido / nutrição não contam progressão
    if (r >= rankOf("conectado")) m.conectados += 1;
    if (r >= rankOf("agendada")) m.agendadas += 1;
    if (r >= rankOf("realizada")) m.realizadas += 1;
    if (r >= rankOf("cof")) m.cof += 1;
    if (r >= rankOf("ganho")) {
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
