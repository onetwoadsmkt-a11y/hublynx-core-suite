import { classifyStage, type StageLite } from "./funnel";

/**
 * Funil por objetivo: o usuário define o que é conversão (o objetivo), qual papel
 * cada etapa do pipeline tem no funil e as metas. O cálculo é cumulativo e exato:
 * chegar a um passo conta também todos os anteriores, e a passagem registrada na
 * jornada (histórico de etapas) vale mesmo que o lead tenha sido perdido depois.
 */
export const STEPS = ["entrada", "conectado", "agendada", "realizada", "cof", "ganho"] as const;
export type StepKey = (typeof STEPS)[number];
export type ExitKey = "perdido" | "noshow" | "nutricao";
export type StageRole = StepKey | ExitKey | "ignorar";

export const STEP_LABEL: Record<StepKey, string> = {
  entrada: "Leads de entrada",
  conectado: "Conectados",
  agendada: "Reunião agendada",
  realizada: "Reunião realizada",
  cof: "Proposta",
  ganho: "Ganho",
};
export const ROLE_LABEL: Record<StageRole, string> = {
  ...STEP_LABEL,
  perdido: "Saída: perdido",
  noshow: "Saída: no-show",
  nutricao: "Saída: nutrição",
  ignorar: "Não conta no funil",
};
export const BLOCKS: { key: "topo" | "meio" | "fundo"; label: string; steps: StepKey[] }[] = [
  { key: "topo", label: "Topo", steps: ["entrada", "conectado"] },
  { key: "meio", label: "Meio", steps: ["agendada", "realizada"] },
  { key: "fundo", label: "Fundo", steps: ["cof", "ganho"] },
];

export type FunnelGoals = {
  /** O que é conversão: o lead chegou (ou passou) por este passo. */
  objective: Exclude<StepKey, "entrada">;
  /** Papel de cada etapa (id da etapa → papel). Sem entrada = automático pelo nome. */
  stageMap: Record<string, StageRole>;
  /** Contar também as tags de funil marcadas no lead. */
  useTags: boolean;
  /** Contar as etapas por onde o lead passou (histórico da jornada). */
  useHistory: boolean;
  /** Nomes próprios dos passos (ex.: "Diagnóstico" no lugar de "Reunião realizada"). */
  labels: Partial<Record<StepKey, string>>;
  /** Metas do período. */
  targets: {
    leads: number | null;
    conversion: number | null;
    steps: Partial<Record<StepKey, number>>;
  };
};

export const DEFAULT_GOALS: FunnelGoals = {
  objective: "ganho",
  stageMap: {},
  useTags: true,
  useHistory: true,
  labels: {},
  targets: { leads: null, conversion: null, steps: {} },
};

/** Junta o salvo com o padrão (campos novos ou ausentes não quebram). */
export function normalizeGoals(raw: unknown): FunnelGoals {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<FunnelGoals>;
  const obj = r.objective as string | undefined;
  const objective = (obj && obj !== "entrada" && STEPS.includes(obj as StepKey) ? obj : "ganho") as FunnelGoals["objective"];
  return {
    objective,
    stageMap: { ...(r.stageMap ?? {}) },
    useTags: r.useTags ?? true,
    useHistory: r.useHistory ?? true,
    labels: { ...(r.labels ?? {}) },
    targets: {
      leads: r.targets?.leads ?? null,
      conversion: r.targets?.conversion ?? null,
      steps: { ...(r.targets?.steps ?? {}) },
    },
  };
}

export function stageRole(stage: StageLite, goals: FunnelGoals): StageRole {
  return goals.stageMap[stage.id] ?? (classifyStage(stage) as StageRole);
}

export type GoalLead = { id: string; stage_id: string | null; value: number | null; tags?: string[] | null };
export type GoalTag = { slug: string; funnel_key: string; active?: boolean };

type Reach = { steps: Set<StepKey>; exits: Set<ExitKey> };

function addRole(role: StageRole | undefined, r: Reach) {
  if (!role || role === "ignorar") return;
  if (role === "perdido" || role === "nutricao") { r.exits.add(role); return; }
  if (role === "noshow") { r.exits.add("noshow"); addRole("agendada", r); return; }
  // Cumulativo: chegar a um passo conta todos os anteriores.
  const idx = STEPS.indexOf(role);
  for (let i = 0; i <= idx; i++) r.steps.add(STEPS[i]);
}

export type GoalFunnel = {
  total: number;
  steps: { key: StepKey; label: string; count: number; pctOfTotal: number; passFromPrev: number | null; target: number | null; belowTarget: boolean }[];
  exits: Record<ExitKey, number>;
  objective: { key: StepKey; label: string; count: number; rate: number; target: number | null; belowTarget: boolean };
  leadsTarget: number | null;
  wonValue: number;
  /** Passo com a menor passagem (o gargalo). */
  worst: { from: StepKey; to: StepKey; pass: number } | null;
};

/**
 * Calcula o funil pelo objetivo. `history`: id do lead → ids das etapas por onde passou.
 */
export function computeGoalFunnel(
  stages: StageLite[],
  leads: GoalLead[],
  goals: FunnelGoals,
  opts: { tags?: GoalTag[]; history?: Record<string, string[]> } = {},
): GoalFunnel {
  const roleById = new Map(stages.map((s) => [s.id, stageRole(s, goals)]));
  const tagRole = new Map(
    (opts.tags ?? [])
      .filter((t) => t.active !== false && t.funnel_key && t.funnel_key !== "nenhum")
      .map((t) => [t.slug.toLowerCase(), t.funnel_key as StageRole]),
  );
  const counts = Object.fromEntries(STEPS.map((k) => [k, 0])) as Record<StepKey, number>;
  const exits: Record<ExitKey, number> = { perdido: 0, noshow: 0, nutricao: 0 };
  let wonValue = 0;

  for (const l of leads) {
    const r: Reach = { steps: new Set(["entrada"]), exits: new Set() };
    addRole(l.stage_id ? roleById.get(l.stage_id) : undefined, r);
    if (goals.useHistory) for (const sid of opts.history?.[l.id] ?? []) addRole(roleById.get(sid), r);
    if (goals.useTags) for (const t of l.tags ?? []) addRole(tagRole.get(String(t).toLowerCase()), r);
    for (const k of r.steps) counts[k]++;
    for (const e of r.exits) exits[e]++;
    if (r.steps.has("ganho")) wonValue += Number(l.value ?? 0);
  }

  const total = leads.length;
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
  const steps = STEPS.map((key, i) => {
    const count = counts[key];
    const passFromPrev = i === 0 ? null : pct(count, counts[STEPS[i - 1]]);
    const target = i === 0 ? null : goals.targets.steps[key] ?? null;
    return {
      key, label: goals.labels[key]?.trim() || STEP_LABEL[key], count,
      pctOfTotal: pct(count, total), passFromPrev, target,
      belowTarget: target != null && passFromPrev != null && counts[STEPS[i - 1]] > 0 && passFromPrev < target,
    };
  });

  let worst: GoalFunnel["worst"] = null;
  const objIdx = STEPS.indexOf(goals.objective);
  for (let i = 1; i <= objIdx; i++) {
    const s = steps[i];
    if (s.passFromPrev == null || counts[STEPS[i - 1]] === 0) continue;
    if (!worst || s.passFromPrev < worst.pass) worst = { from: STEPS[i - 1], to: s.key, pass: s.passFromPrev };
  }

  const objCount = counts[goals.objective];
  const rate = pct(objCount, total);
  const convTarget = goals.targets.conversion ?? null;
  return {
    total,
    steps,
    exits,
    objective: {
      key: goals.objective,
      label: goals.labels[goals.objective]?.trim() || STEP_LABEL[goals.objective],
      count: objCount,
      rate,
      target: convTarget,
      belowTarget: convTarget != null && total > 0 && rate < convTarget,
    },
    leadsTarget: goals.targets.leads ?? null,
    wonValue,
    worst,
  };
}
