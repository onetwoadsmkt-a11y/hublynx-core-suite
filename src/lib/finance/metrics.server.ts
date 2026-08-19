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
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database>;

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

/** Categorias que representam repasse de mídia (não são despesa operacional). */
const MEDIA_CATEGORY_RE = /(repasse|verba|m[ií]dia|ads|investimento em tr[aá]fego)/i;

async function mediaCategoryIds(sb: Db, userId: string): Promise<Set<string>> {
  const { data } = await sb
    .from("finance_categories")
    .select("id, name")
    .or(`owner_id.eq.${userId},owner_id.is.null`);
  return new Set((data ?? []).filter((c) => MEDIA_CATEGORY_RE.test(c.name)).map((c) => c.id));
}

/* ── 1. Receita do mês (competência, natureza fee) ───────────────────────── */
export async function receitaDoMes(sb: Db, userId: string, month: number, year: number) {
  const { data } = await sb
    .from("finances")
    .select("amount")
    .eq("owner_id", userId)
    .eq("kind", "receber")
    .eq("natureza", "fee")
    .eq("competencia", competenciaKey(month, year))
    .neq("status", "cancelado");
  return (data ?? []).reduce((s, r) => s + num(r.amount), 0);
}

/* ── 2. Recebido no mês (caixa: baixas de entrada) ───────────────────────── */
export async function recebidoNoMes(sb: Db, userId: string, month: number, year: number) {
  const { from, to } = monthBounds(month, year);
  const { data } = await sb
    .from("baixas")
    .select("valor, receita_id")
    .eq("empresa_id", userId)
    .not("receita_id", "is", null)
    .gte("data", from)
    .lte("data", to);
  return (data ?? []).reduce((s, b) => s + num(b.valor), 0);
}

/** Pago no mês (caixa: baixas de saída). */
export async function pagoNoMes(sb: Db, userId: string, month: number, year: number) {
  const { from, to } = monthBounds(month, year);
  const { data } = await sb
    .from("baixas")
    .select("valor, despesa_id")
    .eq("empresa_id", userId)
    .not("despesa_id", "is", null)
    .gte("data", from)
    .lte("data", to);
  return (data ?? []).reduce((s, b) => s + num(b.valor), 0);
}

/* ── 3. Despesas do mês (competência, sem repasse de mídia) ─────────────── */
export async function despesasDoMes(sb: Db, userId: string, month: number, year: number) {
  const [{ data }, media] = await Promise.all([
    sb
      .from("finances")
      .select("amount, category_id, natureza")
      .eq("owner_id", userId)
      .eq("kind", "pagar")
      .eq("competencia", competenciaKey(month, year))
      .neq("status", "cancelado"),
    mediaCategoryIds(sb, userId),
  ]);
  return (data ?? [])
    .filter((r) => r.natureza !== "repasse" && !(r.category_id && media.has(r.category_id)))
    .reduce((s, r) => s + num(r.amount), 0);
}

/* ── 4/5. Lucro e margem (mesma competência) ─────────────────────────────── */
export function lucroDoMes(receita: number, despesas: number) {
  return receita - despesas;
}
/** Retorna null quando não há receita — a tela exibe "—", nunca 0,0%. */
export function margemDoMes(receita: number, despesas: number): number | null {
  if (receita <= 0) return null;
  return (lucroDoMes(receita, despesas) / receita) * 100;
}

/* ── 6. Inadimplência (saldo de todos os recebíveis vencidos) ────────────── */
export async function inadimplencia(sb: Db, userId: string) {
  const today = todayISO();
  const { data: rows } = await sb
    .from("finances")
    .select("id, amount")
    .eq("owner_id", userId)
    .eq("kind", "receber")
    .in("status", [...OPEN_STATUSES])
    .lt("due_date", today);
  const ids = (rows ?? []).map((r) => r.id);
  if (!ids.length) return 0;
  const { data: baixas } = await sb
    .from("baixas")
    .select("receita_id, valor")
    .eq("empresa_id", userId)
    .in("receita_id", ids);
  const pago = new Map<string, number>();
  for (const b of baixas ?? []) {
    if (!b.receita_id) continue;
    pago.set(b.receita_id, (pago.get(b.receita_id) ?? 0) + num(b.valor));
  }
  return (rows ?? []).reduce(
    (s, r) => s + Math.max(0, num(r.amount) - (pago.get(r.id) ?? 0)),
    0,
  );
}

/* ── 7. MRR (fee mensal dos contratos recorrentes ativos) ────────────────── */
const RECURRING_MODELS = ["mensal_recorrente", "suporte_continuo"];
const INACTIVE_PROJECTS = ["concluido", "cancelado"];

export async function mrr(sb: Db, userId: string) {
  const [{ data: projects }, { data: recurring }, media] = await Promise.all([
    sb
      .from("projects")
      .select("monthly_value, commercial_model, status")
      .eq("owner_id", userId),
    sb
      .from("finances")
      .select("amount, kind, natureza, category_id, status")
      .eq("owner_id", userId)
      .eq("recurrence", "monthly")
      .is("parent_id", null),
    mediaCategoryIds(sb, userId),
  ]);

  let total = 0;
  for (const p of projects ?? []) {
    const model = p.commercial_model ?? "projeto_fechado";
    if (!RECURRING_MODELS.includes(model)) continue;
    if (INACTIVE_PROJECTS.includes(String(p.status))) continue;
    total += num(p.monthly_value);
  }
  for (const r of recurring ?? []) {
    if (r.kind !== "receber" || r.status === "cancelado") continue;
    if (r.natureza !== "fee") continue; // verba de mídia fica de fora
    if (r.category_id && media.has(r.category_id)) continue;
    total += num(r.amount);
  }
  return total;
}

/* ── 8. Saldo em caixa (saldo inicial das contas + baixas até hoje) ──────── */
export async function saldoEmCaixa(sb: Db, userId: string) {
  const today = todayISO();
  const [{ data: contas }, { data: baixas }] = await Promise.all([
    sb.from("contas").select("saldo_inicial").eq("empresa_id", userId).eq("ativo", true),
    sb
      .from("baixas")
      .select("receita_id, valor")
      .eq("empresa_id", userId)
      .lte("data", today),
  ]);
  let saldo = (contas ?? []).reduce((s, c) => s + num(c.saldo_inicial), 0);
  for (const b of baixas ?? []) saldo += b.receita_id ? num(b.valor) : -num(b.valor);
  return saldo;
}

/** Recebíveis/despesas ainda em aberto vencendo dentro do período. */
export async function emAbertoNoPeriodo(sb: Db, userId: string, from: string, to: string) {
  const { data } = await sb
    .from("finances")
    .select("kind, amount")
    .eq("owner_id", userId)
    .in("status", [...OPEN_STATUSES])
    .gte("due_date", from)
    .lte("due_date", to);
  let receber = 0;
  let pagar = 0;
  for (const r of data ?? []) {
    if (r.kind === "receber") receber += num(r.amount);
    else pagar += num(r.amount);
  }
  return { receber, pagar };
}

/* ── 9. Saldo projetado ──────────────────────────────────────────────────── */
export async function saldoProjetado(sb: Db, userId: string, from: string, to: string) {
  const [caixa, aberto] = await Promise.all([
    saldoEmCaixa(sb, userId),
    emAbertoNoPeriodo(sb, userId, from, to),
  ]);
  return caixa + aberto.receber - aberto.pagar;
}

export type FinanceMetrics = {
  competencia: string;
  from: string;
  to: string;
  receita_mes: number;
  recebido_mes: number;
  pago_mes: number;
  despesas_mes: number;
  lucro_mes: number;
  /** null = sem receita no período (a tela mostra "—"). */
  margem: number | null;
  inadimplencia: number;
  mrr: number;
  saldo_caixa: number;
  saldo_projetado: number;
  a_receber_aberto: number;
  a_pagar_aberto: number;
};

/** Todos os indicadores do mês, calculados no mesmo lugar. */
export async function financeMetrics(
  sb: Db,
  userId: string,
  month: number,
  year: number,
): Promise<FinanceMetrics> {
  const { from, to } = monthBounds(month, year);
  const [receita, recebido, pago, despesas, inad, mrrValue, caixa, aberto] = await Promise.all([
    receitaDoMes(sb, userId, month, year),
    recebidoNoMes(sb, userId, month, year),
    pagoNoMes(sb, userId, month, year),
    despesasDoMes(sb, userId, month, year),
    inadimplencia(sb, userId),
    mrr(sb, userId),
    saldoEmCaixa(sb, userId),
    emAbertoNoPeriodo(sb, userId, from, to),
  ]);
  return {
    competencia: competenciaKey(month, year),
    from,
    to,
    receita_mes: receita,
    recebido_mes: recebido,
    pago_mes: pago,
    despesas_mes: despesas,
    lucro_mes: lucroDoMes(receita, despesas),
    margem: margemDoMes(receita, despesas),
    inadimplencia: inad,
    mrr: mrrValue,
    saldo_caixa: caixa,
    saldo_projetado: caixa + aberto.receber - aberto.pagar,
    a_receber_aberto: aberto.receber,
    a_pagar_aberto: aberto.pagar,
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
  userId: string,
  startMonth: number,
  startYear: number,
  months: number,
): Promise<FinanceMetricsSeries> {
  const { keys, labels } = competenciaRange(startMonth, startYear, months);
  const receita: number[] = [];
  const recebido: number[] = [];
  const despesas: number[] = [];

  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(startYear, startMonth - 1 + i, 1));
    const m = d.getUTCMonth() + 1;
    const y = d.getUTCFullYear();
    const [rec, receb, desp] = await Promise.all([
      receitaDoMes(sb, userId, m, y),
      recebidoNoMes(sb, userId, m, y),
      despesasDoMes(sb, userId, m, y),
    ]);
    receita.push(rec);
    recebido.push(receb);
    despesas.push(desp);
  }

  const lucro = receita.map((v, i) => v - (despesas[i] ?? 0));
  const aberto = receita.map((v, i) => Math.max(0, v - (recebido[i] ?? 0)));
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

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
