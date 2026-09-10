/**
 * Fonte única dos indicadores financeiros.
 *
 * Toda tela do módulo (Visão Geral, Previsão de Faturamento, Recebíveis,
 * Contas a Pagar e Relatórios) deve consumir estas funções — nenhuma delas
 * pode recalcular receita/despesa do seu próprio jeito.
 *
 * Convenções:
 * - Competência (regime de competência) = coluna `competencia` ('AAAA-MM').
 * - Caixa (regime de caixa) = tabela `baixas` (data da baixa).
 * - Receita considera apenas natureza 'fee' (verba de mídia/repasse fica fora).
 * - "Em aberto" é sempre SALDO (valor do título − baixas), nunca o valor cheio.
 * - Escopo é sempre a empresa (organização), não o usuário que criou o registro.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { scoped, toScope, type FinanceScope } from "./scope";

export type Db = SupabaseClient<Database>;
export type { FinanceScope };

/** Status que ainda representam dinheiro a entrar/sair. */
export const OPEN_STATUSES = ["aberto", "parcial"] as const;

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** 'AAAA-MM' do mês selecionado. */
export function competenciaKey(month: number, year: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Primeiro e último dia do mês selecionado. */
export function monthBounds(month: number, year: number) {
  return {
    from: new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
}

/** Sequência de competências a partir de um mês inicial. */
export function competenciaRange(startMonth: number, startYear: number, months: number) {
  const keys: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(startYear, startMonth - 1 + i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    labels.push(
      d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "") +
        "/" +
        String(d.getUTCFullYear()).slice(2),
    );
  }
  return { keys, labels };
}

const num = (v: unknown) => Number(v) || 0;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Categorias que representam repasse de mídia (não são despesa operacional). */
const MEDIA_CATEGORY_RE = /(repasse|verba|m[ií]dia|ads|investimento em tr[aá]fego)/i;

async function mediaCategoryIds(sb: Db, scope: FinanceScope): Promise<Set<string>> {
  const { data } = await sb
    .from("finance_categories")
    .select("id, name, organization_id, owner_id");
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    organization_id?: string | null;
    owner_id?: string | null;
  }>;
  return new Set(
    rows
      .filter((c) =>
        scope.orgId
          ? c.organization_id === scope.orgId || c.organization_id == null
          : c.owner_id === scope.userId || c.owner_id == null,
      )
      .filter((c) => MEDIA_CATEGORY_RE.test(c.name))
      .map((c) => c.id),
  );
}

/** Total já baixado por título (regime de caixa). */
async function paidByFinanceId(
  sb: Db,
  scope: FinanceScope,
  ids: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const { data } = await scoped(
    sb.from("baixas").select("receita_id, despesa_id, valor"),
    scope,
    "empresa_id",
  );
  for (const b of (data ?? []) as Array<{
    receita_id: string | null;
    despesa_id: string | null;
    valor: number | string;
  }>) {
    const key = b.receita_id ?? b.despesa_id;
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + num(b.valor));
  }
  return map;
}

/* ── 1. Receita do mês (competência, natureza fee) ───────────────────────── */
export async function receitaDoMes(sb: Db, u: string | FinanceScope, month: number, year: number) {
  const scope = await toScope(sb, u);
  const { data } = await scoped(
    sb
      .from("finances")
      .select("amount")
      .eq("kind", "receber")
      .eq("natureza", "fee")
      .eq("competencia", competenciaKey(month, year))
      .neq("status", "cancelado"),
    scope,
  );
  return round2((data ?? []).reduce((s, r) => s + num(r.amount), 0));
}

/** Receita bruta da competência (inclui repasse/reembolso) — bate com a lista de Receber. */
export async function receitaBrutaDoMes(
  sb: Db,
  u: string | FinanceScope,
  month: number,
  year: number,
) {
  const scope = await toScope(sb, u);
  const { data } = await scoped(
    sb
      .from("finances")
      .select("amount")
      .eq("kind", "receber")
      .eq("competencia", competenciaKey(month, year))
      .neq("status", "cancelado"),
    scope,
  );
  return round2((data ?? []).reduce((s, r) => s + num(r.amount), 0));
}

/* ── 2. Recebido no mês (caixa: baixas de entrada) ───────────────────────── */
export async function recebidoNoMes(sb: Db, u: string | FinanceScope, month: number, year: number) {
  const scope = await toScope(sb, u);
  const { from, to } = monthBounds(month, year);
  const { data } = await scoped(
    sb
      .from("baixas")
      .select("valor, receita_id")
      .not("receita_id", "is", null)
      .gte("data", from)
      .lte("data", to),
    scope,
    "empresa_id",
  );
  return round2((data ?? []).reduce((s, b) => s + num(b.valor), 0));
}

/** Pago no mês (caixa: baixas de saída). */
export async function pagoNoMes(sb: Db, u: string | FinanceScope, month: number, year: number) {
  const scope = await toScope(sb, u);
  const { from, to } = monthBounds(month, year);
  const { data } = await scoped(
    sb
      .from("baixas")
      .select("valor, despesa_id")
      .not("despesa_id", "is", null)
      .gte("data", from)
      .lte("data", to),
    scope,
    "empresa_id",
  );
  return round2((data ?? []).reduce((s, b) => s + num(b.valor), 0));
}

/* ── 3. Despesas do mês (competência, sem repasse de mídia) ─────────────── */
export async function despesasDoMes(sb: Db, u: string | FinanceScope, month: number, year: number) {
  const scope = await toScope(sb, u);
  const [{ data }, media] = await Promise.all([
    scoped(
      sb
        .from("finances")
        .select("amount, category_id, natureza, repasse_origem_id")
        .eq("kind", "pagar")
        .eq("competencia", competenciaKey(month, year))
        .neq("status", "cancelado"),
      scope,
    ),
    mediaCategoryIds(sb, scope),
  ]);
  return round2(
    (data ?? [])
      .filter(
        (r) =>
          r.natureza !== "repasse" &&
          r.natureza !== "reembolso" &&
          !r.repasse_origem_id && // despesa espelho de repasse não é operacional
          !(r.category_id && media.has(r.category_id)),
      )
      .reduce((s, r) => s + num(r.amount), 0),
  );
}

/** Despesa bruta da competência (inclui repasse de mídia) — bate com a lista de Pagar. */
export async function despesasBrutasDoMes(
  sb: Db,
  u: string | FinanceScope,
  month: number,
  year: number,
) {
  const scope = await toScope(sb, u);
  const { data } = await scoped(
    sb
      .from("finances")
      .select("amount")
      .eq("kind", "pagar")
      .eq("competencia", competenciaKey(month, year))
      .neq("status", "cancelado"),
    scope,
  );
  return round2((data ?? []).reduce((s, r) => s + num(r.amount), 0));
}

/* ── 4/5. Lucro e margem (mesma competência) ─────────────────────────────── */
export function lucroDoMes(receita: number, despesas: number) {
  return round2(receita - despesas);
}
/** Retorna null quando não há receita — a tela exibe "—", nunca 0,0%. */
export function margemDoMes(receita: number, despesas: number): number | null {
  if (receita <= 0) return null;
  return (lucroDoMes(receita, despesas) / receita) * 100;
}

/* ── 6. Inadimplência (saldo de todos os recebíveis vencidos) ────────────── */
export async function inadimplencia(sb: Db, u: string | FinanceScope) {
  const scope = await toScope(sb, u);
  const today = todayISO();
  const { data: rows } = await scoped(
    sb
      .from("finances")
      .select("id, amount")
      .eq("kind", "receber")
      .in("status", [...OPEN_STATUSES])
      .lt("due_date", today),
    scope,
  );
  const ids = (rows ?? []).map((r) => r.id);
  if (!ids.length) return 0;
  const pago = await paidByFinanceId(sb, scope, ids);
  return round2(
    (rows ?? []).reduce((s, r) => s + Math.max(0, num(r.amount) - (pago.get(r.id) ?? 0)), 0),
  );
}

/* ── 7. MRR (fee mensal dos contratos recorrentes ativos) ────────────────── */
const RECURRING_MODELS = ["mensal_recorrente", "suporte_continuo"];
const INACTIVE_PROJECTS = ["concluido", "cancelado"];

export async function mrr(sb: Db, u: string | FinanceScope) {
  const scope = await toScope(sb, u);
  const [{ data: projects }, { data: recurring }, media] = await Promise.all([
    scoped(sb.from("projects").select("monthly_value, commercial_model, status"), scope),
    scoped(
      sb
        .from("finances")
        .select("amount, kind, natureza, category_id, status, recurrence_until")
        .eq("recurrence", "monthly")
        .is("parent_id", null),
      scope,
    ),
    mediaCategoryIds(sb, scope),
  ]);

  const today = todayISO();
  let total = 0;
  for (const p of projects ?? []) {
    const model = p.commercial_model ?? "projeto_fechado";
    if (!RECURRING_MODELS.includes(model)) continue;
    if (INACTIVE_PROJECTS.includes(String(p.status))) continue;
    total += num(p.monthly_value);
  }
  for (const r of (recurring ?? []) as Array<{
    amount: number | string;
    kind: string;
    natureza: string | null;
    category_id: string | null;
    status: string;
    recurrence_until: string | null;
  }>) {
    if (r.kind !== "receber" || r.status === "cancelado") continue;
    if (r.natureza !== "fee") continue; // verba de mídia fica de fora
    if (r.category_id && media.has(r.category_id)) continue;
    if (r.recurrence_until && r.recurrence_until < today) continue; // contrato encerrado
    total += num(r.amount);
  }
  return round2(total);
}

/* ── 8. Saldo em caixa (saldo inicial das contas + baixas até hoje) ──────── */
export async function saldoEmCaixa(sb: Db, u: string | FinanceScope) {
  const scope = await toScope(sb, u);
  const today = todayISO();
  const [{ data: contas }, { data: baixas }] = await Promise.all([
    scoped(sb.from("contas").select("saldo_inicial").eq("ativo", true), scope, "empresa_id"),
    scoped(sb.from("baixas").select("receita_id, valor").lte("data", today), scope, "empresa_id"),
  ]);
  let saldo = (contas ?? []).reduce((s, c) => s + num(c.saldo_inicial), 0);
  for (const b of baixas ?? []) saldo += b.receita_id ? num(b.valor) : -num(b.valor);
  return round2(saldo);
}

/** Saldo ainda em aberto (valor − baixas) dos títulos que vencem no período. */
export async function emAbertoNoPeriodo(
  sb: Db,
  u: string | FinanceScope,
  from: string,
  to: string,
) {
  const scope = await toScope(sb, u);
  const { data } = await scoped(
    sb
      .from("finances")
      .select("id, kind, amount")
      .in("status", [...OPEN_STATUSES])
      .gte("due_date", from)
      .lte("due_date", to),
    scope,
  );
  const rows = (data ?? []) as Array<{ id: string; kind: string; amount: number | string }>;
  const pago = await paidByFinanceId(
    sb,
    scope,
    rows.map((r) => r.id),
  );
  let receber = 0;
  let pagar = 0;
  for (const r of rows) {
    const saldo = Math.max(0, num(r.amount) - (pago.get(r.id) ?? 0));
    if (r.kind === "receber") receber += saldo;
    else pagar += saldo;
  }
  return { receber: round2(receber), pagar: round2(pagar) };
}

/** Saldo em aberto pela competência do mês (regime de competência). */
export async function emAbertoNaCompetencia(
  sb: Db,
  u: string | FinanceScope,
  month: number,
  year: number,
) {
  const scope = await toScope(sb, u);
  const { data } = await scoped(
    sb
      .from("finances")
      .select("id, kind, amount")
      .in("status", [...OPEN_STATUSES])
      .eq("competencia", competenciaKey(month, year)),
    scope,
  );
  const rows = (data ?? []) as Array<{ id: string; kind: string; amount: number | string }>;
  const pago = await paidByFinanceId(
    sb,
    scope,
    rows.map((r) => r.id),
  );
  let receber = 0;
  let pagar = 0;
  for (const r of rows) {
    const saldo = Math.max(0, num(r.amount) - (pago.get(r.id) ?? 0));
    if (r.kind === "receber") receber += saldo;
    else pagar += saldo;
  }
  return { receber: round2(receber), pagar: round2(pagar) };
}

/* ── 9. Saldo projetado ──────────────────────────────────────────────────── */
export async function saldoProjetado(sb: Db, u: string | FinanceScope, from: string, to: string) {
  const scope = await toScope(sb, u);
  const [caixa, aberto] = await Promise.all([
    saldoEmCaixa(sb, scope),
    emAbertoNoPeriodo(sb, scope, from, to),
  ]);
  return round2(caixa + aberto.receber - aberto.pagar);
}

export type FinanceMetrics = {
  competencia: string;
  from: string;
  to: string;
  receita_mes: number;
  /** Receita da competência incluindo repasse/reembolso (bate com a lista). */
  receita_bruta_mes: number;
  recebido_mes: number;
  pago_mes: number;
  despesas_mes: number;
  /** Despesa da competência incluindo repasse de mídia (bate com a lista). */
  despesas_brutas_mes: number;
  lucro_mes: number;
  /** null = sem receita no período (a tela mostra "—"). */
  margem: number | null;
  inadimplencia: number;
  mrr: number;
  saldo_caixa: number;
  saldo_projetado: number;
  /** Saldo em aberto por vencimento no período (caixa). */
  a_receber_aberto: number;
  a_pagar_aberto: number;
  /** Saldo em aberto pela competência do mês. */
  a_receber_competencia: number;
  a_pagar_competencia: number;
};

/** Todos os indicadores do mês, calculados no mesmo lugar. */
export async function financeMetrics(
  sb: Db,
  u: string | FinanceScope,
  month: number,
  year: number,
): Promise<FinanceMetrics> {
  const scope = await toScope(sb, u);
  const { from, to } = monthBounds(month, year);
  const [
    receita,
    receitaBruta,
    recebido,
    pago,
    despesas,
    despesasBrutas,
    inad,
    mrrValue,
    caixa,
    aberto,
    abertoComp,
  ] = await Promise.all([
    receitaDoMes(sb, scope, month, year),
    receitaBrutaDoMes(sb, scope, month, year),
    recebidoNoMes(sb, scope, month, year),
    pagoNoMes(sb, scope, month, year),
    despesasDoMes(sb, scope, month, year),
    despesasBrutasDoMes(sb, scope, month, year),
    inadimplencia(sb, scope),
    mrr(sb, scope),
    saldoEmCaixa(sb, scope),
    emAbertoNoPeriodo(sb, scope, from, to),
    emAbertoNaCompetencia(sb, scope, month, year),
  ]);
  return {
    competencia: competenciaKey(month, year),
    from,
    to,
    receita_mes: receita,
    receita_bruta_mes: receitaBruta,
    recebido_mes: recebido,
    pago_mes: pago,
    despesas_mes: despesas,
    despesas_brutas_mes: despesasBrutas,
    lucro_mes: lucroDoMes(receita, despesas),
    margem: margemDoMes(receita, despesas),
    inadimplencia: inad,
    mrr: mrrValue,
    saldo_caixa: caixa,
    saldo_projetado: round2(caixa + aberto.receber - aberto.pagar),
    a_receber_aberto: aberto.receber,
    a_pagar_aberto: aberto.pagar,
    a_receber_competencia: abertoComp.receber,
    a_pagar_competencia: abertoComp.pagar,
  };
}

export type FinanceMetricsSeries = {
  keys: string[];
  labels: string[];
  receita: number[];
  recebido: number[];
  despesas: number[];
  lucro: number[];
  aberto: number[];
  totals: {
    receita: number;
    recebido: number;
    despesas: number;
    lucro: number;
    aberto: number;
  };
};

/** Mesma matemática do mês, repetida mês a mês (usada por Recebíveis e Previsão). */
export async function financeMetricsSeries(
  sb: Db,
  u: string | FinanceScope,
  startMonth: number,
  startYear: number,
  months: number,
): Promise<FinanceMetricsSeries> {
  const scope = await toScope(sb, u);
  const { keys, labels } = competenciaRange(startMonth, startYear, months);
  const receita: number[] = [];
  const recebido: number[] = [];
  const despesas: number[] = [];
  const aberto: number[] = [];

  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(startYear, startMonth - 1 + i, 1));
    const m = d.getUTCMonth() + 1;
    const y = d.getUTCFullYear();
    const [rec, receb, desp, ab] = await Promise.all([
      receitaDoMes(sb, scope, m, y),
      recebidoNoMes(sb, scope, m, y),
      despesasDoMes(sb, scope, m, y),
      emAbertoNaCompetencia(sb, scope, m, y),
    ]);
    receita.push(rec);
    recebido.push(receb);
    despesas.push(desp);
    // Em aberto é saldo real dos títulos da competência, não receita − recebido.
    aberto.push(ab.receber);
  }

  const lucro = receita.map((v, i) => round2(v - (despesas[i] ?? 0)));
  const sum = (a: number[]) => round2(a.reduce((s, v) => s + v, 0));

  return {
    keys,
    labels,
    receita,
    recebido,
    despesas,
    lucro,
    aberto,
    totals: {
      receita: sum(receita),
      recebido: sum(recebido),
      despesas: sum(despesas),
      lucro: sum(lucro),
      aberto: sum(aberto),
    },
  };
}
