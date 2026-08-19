/**
 * Linhas de serviço — camada entre Clientes/Projetos (contratos) e o dinheiro.
 * Toda métrica aqui segue as mesmas convenções de metrics.server.ts:
 * receita = natureza 'fee' por competência; caixa = tabela `baixas`.
 */
import type { Db } from "./metrics.server";
import { todayISO, OPEN_STATUSES } from "./metrics.server";

const num = (v: unknown) => Number(v) || 0;
const MEDIA_CATEGORY_RE = /(repasse|verba|m[ií]dia|ads|investimento em tr[aá]fego)/i;
const RECURRING_MODELS = ["mensal_recorrente", "suporte_continuo"];
const INACTIVE_PROJECTS = ["concluido", "cancelado"];

export type ServiceLineCard = {
  id: string | null;
  nome: string;
  cor: string;
  ativo: boolean;
  receita_ano: number;
  clientes: number;
  fee_recorrente: number;
  recebido: number;
  em_atraso: number;
  midia_sob_gestao: number;
  custo_direto: number;
  /** (receita − custo direto) ÷ receita × 100 — null quando não há receita. */
  margem: number | null;
};

export type ServiceContractRow = {
  id: string;
  name: string;
  client: string | null;
  servico_id: string | null;
  status: string;
  commercial_model: string;
  valor_mensal: number;
  receita_ano: number;
};

export type ServiceLinesPanel = {
  year: number;
  lines: ServiceLineCard[];
  contracts: ServiceContractRow[];
};

const UNASSIGNED = "__none__";

export async function serviceLinesPanel(
  sb: Db,
  userId: string,
  year: number,
): Promise<ServiceLinesPanel> {
  const from = `${year}-01`;
  const to = `${year}-12`;
  const today = todayISO();

  const [
    { data: servicos },
    { data: projects },
    { data: clients },
    { data: yearRows },
    { data: allFinances },
    { data: categories },
  ] = await Promise.all([
    sb.from("servicos").select("id, nome, cor, ativo").eq("empresa_id", userId).order("nome"),
    sb
      .from("projects")
      .select("id, name, client_id, servico_id, status, commercial_model, monthly_value")
      .eq("owner_id", userId),
    sb.from("clients").select("id, name").eq("owner_id", userId),
    sb
      .from("finances")
      .select(
        "id, kind, amount, natureza, competencia, status, servico_id, project_id, client_id, category_id, repasse_origem_id, recurrence, parent_id",
      )
      .eq("owner_id", userId)
      .gte("competencia", from)
      .lte("competencia", to),
    sb.from("finances").select("id, kind, amount, servico_id, status, due_date").eq("owner_id", userId),
    sb.from("finance_categories").select("id, name").or(`owner_id.eq.${userId},owner_id.is.null`),
  ]);

  const media = new Set(
    (categories ?? []).filter((c) => MEDIA_CATEGORY_RE.test(c.name)).map((c) => c.id),
  );
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const financeLine = new Map((allFinances ?? []).map((f) => [f.id, f.servico_id ?? null]));

  // Baixas do ano, para o regime de caixa por linha.
  const { data: baixas } = await sb
    .from("baixas")
    .select("receita_id, valor, data")
    .eq("empresa_id", userId)
    .not("receita_id", "is", null)
    .gte("data", `${year}-01-01`)
    .lte("data", `${year}-12-31`);

  // Baixas de recebíveis em atraso (para calcular saldo).
  const overdue = (allFinances ?? []).filter(
    (f) =>
      f.kind === "receber" &&
      OPEN_STATUSES.includes(f.status as (typeof OPEN_STATUSES)[number]) &&
      String(f.due_date) < today,
  );
  const pagoById = new Map<string, number>();
  if (overdue.length) {
    const { data: paid } = await sb
      .from("baixas")
      .select("receita_id, valor")
      .eq("empresa_id", userId)
      .in(
        "receita_id",
        overdue.map((f) => f.id),
      );
    for (const b of paid ?? []) {
      if (!b.receita_id) continue;
      pagoById.set(b.receita_id, (pagoById.get(b.receita_id) ?? 0) + num(b.valor));
    }
  }

  const blank = (): Omit<ServiceLineCard, "id" | "nome" | "cor" | "ativo" | "margem"> => ({
    receita_ano: 0,
    clientes: 0,
    fee_recorrente: 0,
    recebido: 0,
    em_atraso: 0,
    midia_sob_gestao: 0,
    custo_direto: 0,
  });

  const acc = new Map<string, ReturnType<typeof blank>>();
  const clientSets = new Map<string, Set<string>>();
  const get = (id: string | null) => {
    const k = id ?? UNASSIGNED;
    let a = acc.get(k);
    if (!a) {
      a = blank();
      acc.set(k, a);
      clientSets.set(k, new Set());
    }
    return a;
  };

  const receitaAnoPorProjeto = new Map<string, number>();

  for (const f of yearRows ?? []) {
    if (f.status === "cancelado") continue;
    const a = get(f.servico_id ?? null);
    const k = f.servico_id ?? UNASSIGNED;
    if (f.client_id) clientSets.get(k)?.add(f.client_id);
    const amount = num(f.amount);
    if (f.kind === "receber") {
      if (f.natureza === "fee") {
        a.receita_ano += amount;
        if (f.project_id)
          receitaAnoPorProjeto.set(
            f.project_id,
            (receitaAnoPorProjeto.get(f.project_id) ?? 0) + amount,
          );
        if (f.recurrence === "monthly" && !f.parent_id && !(f.category_id && media.has(f.category_id)))
          a.fee_recorrente += amount;
      } else {
        a.midia_sob_gestao += amount;
      }
    } else {
      const espelho = !!f.repasse_origem_id || f.natureza === "repasse" || f.natureza === "reembolso";
      const isMedia = !!f.category_id && media.has(f.category_id);
      if (!espelho && !isMedia) a.custo_direto += amount;
    }
  }

  for (const b of baixas ?? []) {
    const line = b.receita_id ? (financeLine.get(b.receita_id) ?? null) : null;
    get(line).recebido += num(b.valor);
  }

  for (const f of overdue) {
    const saldo = Math.max(0, num(f.amount) - (pagoById.get(f.id) ?? 0));
    if (saldo > 0) get(f.servico_id ?? null).em_atraso += saldo;
  }

  for (const p of projects ?? []) {
    const a = get(p.servico_id ?? null);
    const k = p.servico_id ?? UNASSIGNED;
    if (p.client_id) clientSets.get(k)?.add(p.client_id);
    const model = p.commercial_model ?? "projeto_fechado";
    if (RECURRING_MODELS.includes(model) && !INACTIVE_PROJECTS.includes(String(p.status)))
      a.fee_recorrente += num(p.monthly_value);
  }

  const build = (id: string | null, nome: string, cor: string, ativo: boolean): ServiceLineCard => {
    const k = id ?? UNASSIGNED;
    const a = acc.get(k) ?? blank();
    return {
      id,
      nome,
      cor,
      ativo,
      ...a,
      clientes: clientSets.get(k)?.size ?? 0,
      margem: a.receita_ano > 0 ? ((a.receita_ano - a.custo_direto) / a.receita_ano) * 100 : null,
    };
  };

  const lines: ServiceLineCard[] = (servicos ?? []).map((s) =>
    build(s.id, s.nome, s.cor ?? "#22C55E", s.ativo ?? true),
  );
  if (acc.has(UNASSIGNED)) lines.push(build(null, "Sem linha de serviço", "#94A3B8", true));

  const contracts: ServiceContractRow[] = (projects ?? [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      client: p.client_id ? (clientName.get(p.client_id) ?? null) : null,
      servico_id: p.servico_id ?? null,
      status: String(p.status),
      commercial_model: p.commercial_model ?? "projeto_fechado",
      valor_mensal: num(p.monthly_value),
      receita_ano: receitaAnoPorProjeto.get(p.id) ?? 0,
    }))
    .sort((a, b) => (a.client ?? "").localeCompare(b.client ?? "") || a.name.localeCompare(b.name));

  return { year, lines, contracts };
}

/** Composição da receita (fee, competência) do mês por linha de serviço. */
export async function revenueByServiceLine(sb: Db, userId: string, month: number, year: number) {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const [{ data: rows }, { data: servicos }] = await Promise.all([
    sb
      .from("finances")
      .select("amount, servico_id")
      .eq("owner_id", userId)
      .eq("kind", "receber")
      .eq("natureza", "fee")
      .eq("competencia", key)
      .neq("status", "cancelado"),
    sb.from("servicos").select("id, nome, cor").eq("empresa_id", userId),
  ]);
  const meta = new Map((servicos ?? []).map((s) => [s.id, s]));
  const acc = new Map<string, number>();
  for (const r of rows ?? []) {
    const k = r.servico_id ?? UNASSIGNED;
    acc.set(k, (acc.get(k) ?? 0) + num(r.amount));
  }
  const total = [...acc.values()].reduce((s, v) => s + v, 0);
  const parts = [...acc.entries()]
    .map(([k, valor]) => ({
      id: k === UNASSIGNED ? null : k,
      nome: k === UNASSIGNED ? "Sem linha" : (meta.get(k)?.nome ?? "Linha"),
      cor: k === UNASSIGNED ? "#94A3B8" : (meta.get(k)?.cor ?? "#22C55E"),
      valor,
      pct: total > 0 ? (valor / total) * 100 : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
  return { total, parts };
}

export type RevenueComposition = Awaited<ReturnType<typeof revenueByServiceLine>>;
