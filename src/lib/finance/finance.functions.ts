import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AlertItem,
  CashflowPoint,
  DashboardKpis,
  DREData,
  FinanceCategory,
  FinanceKind,
  FinanceRow,
  ForecastBucket,
  ProfitabilityRow,
} from "./types";

const DEFAULT_INCOME_CATS = [
  "Desenvolvimento de Sistemas",
  "Tráfego Pago",
  "Gestão de Conteúdo",
  "Consultoria",
  "Suporte",
  "Outros",
];
const DEFAULT_EXPENSE_CATS = [
  "Salários",
  "Freelancer",
  "Software",
  "Marketing",
  "Hospedagem",
  "Internet",
  "Equipamentos",
  "Impostos",
  "Outros",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthRange(month: number, year: number) {
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from, to };
}
function addMonths(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

const monthSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

const kindSchema = z.enum(["receber", "pagar"]);
/** Status gravados no banco (regime de competência). "atrasado" não existe mais como status. */
const statusSchema = z.enum(["aberto", "parcial", "quitado", "cancelado"]);
/** Status aceitos como filtro de consulta — "atrasado" é derivado (vencido com saldo). */
const filterStatusSchema = z.enum(["aberto", "parcial", "quitado", "cancelado", "atrasado"]);

// ── ensureDefaultCategories ──────────────────────────────────────────────
export const ensureDefaultCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("finance_categories")
      .select("kind, name")
      .eq("owner_id", userId);
    const have = new Set((existing ?? []).map((c) => `${c.kind}:${c.name}`));
    const rows: Array<{ owner_id: string; kind: FinanceKind; name: string; is_default: boolean }> = [];
    for (const n of DEFAULT_INCOME_CATS)
      if (!have.has(`receber:${n}`))
        rows.push({ owner_id: userId, kind: "receber", name: n, is_default: true });
    for (const n of DEFAULT_EXPENSE_CATS)
      if (!have.has(`pagar:${n}`))
        rows.push({ owner_id: userId, kind: "pagar", name: n, is_default: true });
    if (rows.length) await supabase.from("finance_categories").insert(rows);
    return { ok: true, created: rows.length };
  });

// ── runRecurringRollover ─────────────────────────────────────────────────
export const runRecurringRollover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: contracts } = await supabase
      .from("finances")
      .select("*")
      .eq("owner_id", userId)
      .eq("recurrence", "monthly")
      .is("parent_id", null);

    const created: string[] = [];
    for (const c of contracts ?? []) {
      if (c.recurrence_until && c.recurrence_until < todayISO()) continue;
      const { data: children } = await supabase
        .from("finances")
        .select("due_date")
        .eq("parent_id", c.id)
        .order("due_date", { ascending: false })
        .limit(1);
      const lastDue = children?.[0]?.due_date ?? c.due_date;
      const next = addMonths(lastDue, 1);
      const lookahead = new Date();
      lookahead.setDate(lookahead.getDate() + 35);
      const lookaheadISO = lookahead.toISOString().slice(0, 10);
      if (next > lookaheadISO) continue;
      let cursor = next;
      for (let i = 0; i < 2; i++) {
        if (cursor > lookaheadISO) break;
        const { error } = await supabase.from("finances").insert({
          owner_id: userId,
          kind: c.kind as FinanceKind,
          client_id: c.client_id,
          project_id: c.project_id,
          category_id: c.category_id,
          supplier: c.supplier,
          description: c.description,
          amount: c.amount,
          due_date: cursor,
          status: "aberto",
          payment_method: c.payment_method,
          recurrence: "none",
          parent_id: c.id,
        });
        if (!error) created.push(cursor);
        cursor = addMonths(cursor, 1);
      }
    }
    return { created };
  });

// ── getDashboard ─────────────────────────────────────────────────────────
export const getFinanceDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => monthSchema.parse(d))
  .handler(async ({ data, context }): Promise<DashboardKpis> => {
    const { supabase, userId } = context;
    const { from, to } = monthRange(data.month, data.year);
    const { data: rows } = await supabase
      .from("finances")
      .select("kind, amount, status, due_date, paid_at")
      .eq("owner_id", userId)
      .gte("due_date", from)
      .lte("due_date", to);

    let receita_realizada = 0,
      receita_prevista = 0,
      despesa_realizada = 0,
      despesa_prevista = 0;
    for (const r of rows ?? []) {
      const amt = Number(r.amount) || 0;
      const paid = r.status === "quitado";
      if (r.kind === "receber") {
        if (paid) receita_realizada += amt;
        else receita_prevista += amt;
      } else {
        if (paid) despesa_realizada += amt;
        else despesa_prevista += amt;
      }
    }
    const lucro = receita_realizada - despesa_realizada;
    const margem = receita_realizada > 0 ? (lucro / receita_realizada) * 100 : 0;

    const today = todayISO();
    const { data: allPaid } = await supabase
      .from("finances")
      .select("kind, amount")
      .eq("owner_id", userId)
      .eq("status", "quitado")
      .lte("paid_at", today);
    let saldo_caixa = 0;
    for (const r of allPaid ?? []) {
      const amt = Number(r.amount) || 0;
      saldo_caixa += r.kind === "receber" ? amt : -amt;
    }

    const { data: overdue } = await supabase
      .from("finances")
      .select("amount")
      .eq("owner_id", userId)
      .eq("kind", "receber")
      .eq("status", "aberto")
      .lt("due_date", today);
    const inadimplencia = (overdue ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);

    const { data: clientsActive } = await supabase
      .from("clients")
      .select("monthly_value, status")
      .eq("owner_id", userId)
      .eq("status", "ativo");
    let mrr = (clientsActive ?? []).reduce((s, c) => s + (Number(c.monthly_value) || 0), 0);
    const { data: recurringFin } = await supabase
      .from("finances")
      .select("amount, kind")
      .eq("owner_id", userId)
      .eq("recurrence", "monthly")
      .is("parent_id", null);
    for (const r of recurringFin ?? []) {
      if (r.kind === "receber") mrr += Number(r.amount) || 0;
    }

    return {
      receita_realizada,
      receita_prevista,
      despesa_realizada,
      despesa_prevista,
      lucro,
      margem,
      saldo_caixa,
      inadimplencia,
      mrr,
    };
  });

// ── listFinances ─────────────────────────────────────────────────────────
const listSchema = z.object({
  kind: kindSchema,
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  status: z.string().optional(),
  clientId: z.string().optional(),
  q: z.string().optional(),
});

export const listFinances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }): Promise<FinanceRow[]> => {
    const { supabase, userId } = context;
    const { from, to } = monthRange(data.month, data.year);
    let q = supabase
      .from("finances")
      .select(
        "id, kind, description, amount, due_date, paid_at, status, client_id, project_id, category_id, supplier, payment_method, recurrence, recurrence_day, recurrence_until, parent_id, installment_no, installment_total, clients(name), projects(name), finance_categories(name)",
      )
      .eq("owner_id", userId)
      .eq("kind", data.kind)
      .gte("due_date", from)
      .lte("due_date", to)
      .order("due_date", { ascending: true });

    if (data.status && data.status !== "all" && (data.status === "aberto" || data.status === "quitado" || data.status === "atrasado")) {
      q = q.eq("status", data.status);
    }
    if (data.clientId) q = q.eq("client_id", data.clientId);

    const { data: rows } = await q;
    const today = todayISO();
    const out: FinanceRow[] = [];
    for (const r of rows ?? []) {
      const status =
        r.status === "aberto" && r.due_date < today ? "atrasado" : (r.status as FinanceRow["status"]);
      const row: FinanceRow = {
        id: r.id,
        kind: r.kind as FinanceKind,
        description: r.description,
        amount: Number(r.amount) || 0,
        due_date: r.due_date,
        paid_at: r.paid_at,
        status,
        client_id: r.client_id,
        project_id: r.project_id,
        category_id: r.category_id,
        supplier: r.supplier,
        payment_method: r.payment_method,
        recurrence: ((r as { recurrence?: string }).recurrence ?? "none") as FinanceRow["recurrence"],
        recurrence_day: (r as { recurrence_day?: number | null }).recurrence_day ?? null,
        recurrence_until: (r as { recurrence_until?: string | null }).recurrence_until ?? null,
        parent_id: (r as { parent_id?: string | null }).parent_id ?? null,
        installment_no: (r as { installment_no?: number | null }).installment_no ?? null,
        installment_total: (r as { installment_total?: number | null }).installment_total ?? null,
        client_name: (r.clients as { name: string } | null)?.name ?? null,
        project_name: (r.projects as { name: string } | null)?.name ?? null,
        category_name: (r.finance_categories as { name: string } | null)?.name ?? null,
      };
      if (data.q) {
        const hay = `${row.description ?? ""} ${row.client_name ?? ""} ${row.supplier ?? ""} ${row.project_name ?? ""}`.toLowerCase();
        if (!hay.includes(data.q.toLowerCase())) continue;
      }
      out.push(row);
    }
    return out;
  });

// ── upsertFinance ────────────────────────────────────────────────────────
const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  kind: kindSchema,
  description: z.string().max(500).nullable().optional(),
  amount: z.number().positive(),
  due_date: z.string(),
  status: statusSchema.default("aberto"),
  client_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  supplier: z.string().max(200).nullable().optional(),
  payment_method: z.string().max(80).nullable().optional(),
  paid_at: z.string().nullable().optional(),
  recurrence: z.enum(["none", "monthly"]).default("none"),
  recurrence_day: z.number().int().min(1).max(31).nullable().optional(),
  recurrence_until: z.string().nullable().optional(),
  installments: z.number().int().min(1).max(60).optional(),
});

export const upsertFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.id) {
      const { error } = await supabase
        .from("finances")
        .update({
          kind: data.kind,
          description: data.description ?? null,
          amount: data.amount,
          due_date: data.due_date,
          status: data.status,
          client_id: data.client_id ?? null,
          project_id: data.project_id ?? null,
          category_id: data.category_id ?? null,
          supplier: data.supplier ?? null,
          payment_method: data.payment_method ?? null,
          paid_at: data.paid_at ?? null,
        })
        .eq("id", data.id)
        .eq("owner_id", userId);
      if (error) {
        if (error.message.includes("uq_finances_parent_due")) {
          throw new Error("Já existe um lançamento desta recorrência nesta data de vencimento.");
        }
        throw new Error(error.message);
      }
      return { ok: true, id: data.id };
    }

    if (data.installments && data.installments > 1) {
      const total = data.installments;
      const each = Math.round((data.amount / total) * 100) / 100;
      const { data: first, error: e1 } = await supabase
        .from("finances")
        .insert({
          owner_id: userId,
          kind: data.kind,
          description: data.description ?? null,
          amount: each,
          due_date: data.due_date,
          status: "aberto",
          client_id: data.client_id ?? null,
          project_id: data.project_id ?? null,
          category_id: data.category_id ?? null,
          supplier: data.supplier ?? null,
          payment_method: data.payment_method ?? null,
          installment_no: 1,
          installment_total: total,
        })
        .select("id")
        .single();
      if (e1 || !first) throw new Error(e1?.message ?? "insert failed");
      const rest: Array<Record<string, unknown>> = [];
      for (let i = 2; i <= total; i++) {
        rest.push({
          owner_id: userId,
          kind: data.kind,
          description: data.description ?? null,
          amount: each,
          due_date: addMonths(data.due_date, i - 1),
          status: "aberto",
          client_id: data.client_id ?? null,
          project_id: data.project_id ?? null,
          category_id: data.category_id ?? null,
          supplier: data.supplier ?? null,
          payment_method: data.payment_method ?? null,
          installment_no: i,
          installment_total: total,
          parent_id: first.id,
        });
      }
      if (rest.length) await supabase.from("finances").insert(rest as never);
      return { ok: true, id: first.id };
    }

    const { data: ins, error } = await supabase
      .from("finances")
      .insert({
        owner_id: userId,
        kind: data.kind,
        description: data.description ?? null,
        amount: data.amount,
        due_date: data.due_date,
        status: data.status,
        client_id: data.client_id ?? null,
        project_id: data.project_id ?? null,
        category_id: data.category_id ?? null,
        supplier: data.supplier ?? null,
        payment_method: data.payment_method ?? null,
        paid_at: data.paid_at ?? null,
        recurrence: data.recurrence,
        recurrence_day: data.recurrence_day ?? null,
        recurrence_until: data.recurrence_until ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins!.id };
  });

// ── markStatus / delete ──────────────────────────────────────────────────
export const markFinanceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: statusSchema, paid_at: z.string().nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("finances")
      .update({
        status: data.status,
        paid_at: data.status === "quitado" ? data.paid_at ?? todayISO() : null,
      })
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("finances")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Cashflow ─────────────────────────────────────────────────────────────
export const getCashflowSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ range: z.enum(["30d", "60d", "90d", "year"]).default("90d") }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CashflowPoint[]> => {
    const { supabase, userId } = context;
    const days = data.range === "30d" ? 30 : data.range === "60d" ? 60 : data.range === "90d" ? 90 : 365;
    const start = new Date();
    start.setDate(start.getDate() - Math.floor(days / 3));
    const end = new Date();
    end.setDate(end.getDate() + Math.floor((days * 2) / 3));
    const fromISO = start.toISOString().slice(0, 10);
    const toISO = end.toISOString().slice(0, 10);

    const { data: rows } = await supabase
      .from("finances")
      .select("kind, amount, due_date, paid_at, status")
      .eq("owner_id", userId)
      .gte("due_date", fromISO)
      .lte("due_date", toISO);

    const byDate = new Map<string, { in: number; out: number }>();
    for (const r of rows ?? []) {
      const date = r.paid_at ?? r.due_date;
      if (!date) continue;
      const slot = byDate.get(date) ?? { in: 0, out: 0 };
      const amt = Number(r.amount) || 0;
      if (r.kind === "receber") slot.in += amt;
      else slot.out += amt;
      byDate.set(date, slot);
    }
    const dates = Array.from(byDate.keys()).sort();
    let balance = 0;
    return dates.map((date) => {
      const v = byDate.get(date)!;
      balance += v.in - v.out;
      return { date, in: v.in, out: v.out, balance };
    });
  });

// ── DRE ──────────────────────────────────────────────────────────────────
export const getDRE = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => monthSchema.parse(d))
  .handler(async ({ data, context }): Promise<DREData> => {
    const { supabase, userId } = context;
    const { from, to } = monthRange(data.month, data.year);
    const { data: fin } = await supabase
      .from("finances")
      .select("kind, amount, status")
      .eq("owner_id", userId)
      .gte("due_date", from)
      .lte("due_date", to)
      .eq("status", "quitado");
    let receita_bruta = 0,
      despesas = 0;
    for (const r of fin ?? []) {
      const amt = Number(r.amount) || 0;
      if (r.kind === "receber") receita_bruta += amt;
      else despesas += amt;
    }
    const { data: costs } = await supabase
      .from("project_costs")
      .select("amount")
      .eq("owner_id", userId)
      .gte("incurred_at", from)
      .lte("incurred_at", to);
    const custos_operacionais = (costs ?? []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const lucro_liquido = receita_bruta - custos_operacionais - despesas;
    return { receita_bruta, custos_operacionais, despesas, lucro_liquido };
  });

// ── Profitability ────────────────────────────────────────────────────────
const profitSchema = z.object({ from: z.string(), to: z.string() });

export const getProfitabilityByClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => profitSchema.parse(d))
  .handler(async ({ data, context }): Promise<ProfitabilityRow[]> => {
    const { supabase, userId } = context;
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
      .eq("owner_id", userId);
    const { data: fin } = await supabase
      .from("finances")
      .select("kind, amount, status, client_id")
      .eq("owner_id", userId)
      .gte("due_date", data.from)
      .lte("due_date", data.to)
      .eq("status", "quitado");
    const { data: costs } = await supabase
      .from("project_costs")
      .select("amount, projects(client_id)")
      .eq("owner_id", userId)
      .gte("incurred_at", data.from)
      .lte("incurred_at", data.to);

    const map = new Map<string, ProfitabilityRow>();
    for (const c of clients ?? [])
      map.set(c.id, { id: c.id, name: c.name, receita: 0, custos: 0, lucro: 0, margem: 0 });
    for (const r of fin ?? []) {
      if (!r.client_id || !map.has(r.client_id)) continue;
      const row = map.get(r.client_id)!;
      const amt = Number(r.amount) || 0;
      if (r.kind === "receber") row.receita += amt;
      else row.custos += amt;
    }
    for (const c of costs ?? []) {
      const cid = (c.projects as { client_id: string | null } | null)?.client_id;
      if (!cid || !map.has(cid)) continue;
      map.get(cid)!.custos += Number(c.amount) || 0;
    }
    const out: ProfitabilityRow[] = [];
    for (const r of map.values()) {
      r.lucro = r.receita - r.custos;
      r.margem = r.receita > 0 ? (r.lucro / r.receita) * 100 : 0;
      if (r.receita > 0 || r.custos > 0) out.push(r);
    }
    out.sort((a, b) => b.lucro - a.lucro);
    return out;
  });

export const getProfitabilityByProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => profitSchema.parse(d))
  .handler(async ({ data, context }): Promise<ProfitabilityRow[]> => {
    const { supabase, userId } = context;
    const { data: projects } = await supabase
      .from("projects")
      .select("id, name")
      .eq("owner_id", userId);
    const { data: fin } = await supabase
      .from("finances")
      .select("kind, amount, status, project_id")
      .eq("owner_id", userId)
      .gte("due_date", data.from)
      .lte("due_date", data.to)
      .eq("status", "quitado");
    const { data: costs } = await supabase
      .from("project_costs")
      .select("amount, project_id")
      .eq("owner_id", userId)
      .gte("incurred_at", data.from)
      .lte("incurred_at", data.to);

    const map = new Map<string, ProfitabilityRow>();
    for (const p of projects ?? [])
      map.set(p.id, { id: p.id, name: p.name, receita: 0, custos: 0, lucro: 0, margem: 0 });
    for (const r of fin ?? []) {
      if (!r.project_id || !map.has(r.project_id)) continue;
      const row = map.get(r.project_id)!;
      const amt = Number(r.amount) || 0;
      if (r.kind === "receber") row.receita += amt;
      else row.custos += amt;
    }
    for (const c of costs ?? []) {
      if (!c.project_id || !map.has(c.project_id)) continue;
      map.get(c.project_id)!.custos += Number(c.amount) || 0;
    }
    const out: ProfitabilityRow[] = [];
    for (const r of map.values()) {
      r.lucro = r.receita - r.custos;
      r.margem = r.receita > 0 ? (r.lucro / r.receita) * 100 : 0;
      if (r.receita > 0 || r.custos > 0) out.push(r);
    }
    out.sort((a, b) => b.lucro - a.lucro);
    return out;
  });

// ── Forecast ─────────────────────────────────────────────────────────────
export const getForecast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ForecastBucket[]> => {
    const { supabase, userId } = context;
    const today = new Date();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 90);
    const todayISOv = today.toISOString().slice(0, 10);
    const horizonISO = horizon.toISOString().slice(0, 10);
    const { data: rows } = await supabase
      .from("finances")
      .select("id, kind, description, amount, due_date, status")
      .eq("owner_id", userId)
      .eq("status", "aberto")
      .gte("due_date", todayISOv)
      .lte("due_date", horizonISO)
      .order("due_date", { ascending: true });

    const buckets: ForecastBucket[] = [
      { label: "Próximos 30 dias", days: 30, receivables: 0, payables: 0, saldo: 0, items: [] },
      { label: "Próximos 60 dias", days: 60, receivables: 0, payables: 0, saldo: 0, items: [] },
      { label: "Próximos 90 dias", days: 90, receivables: 0, payables: 0, saldo: 0, items: [] },
    ];
    for (const r of rows ?? []) {
      const days = Math.ceil((new Date(r.due_date).getTime() - today.getTime()) / 86400000);
      const amt = Number(r.amount) || 0;
      for (const b of buckets) {
        if (days <= b.days) {
          if (r.kind === "receber") b.receivables += amt;
          else b.payables += amt;
          b.items.push({
            id: r.id,
            due_date: r.due_date,
            description: r.description ?? "",
            amount: amt,
            kind: r.kind as FinanceKind,
          });
        }
      }
    }
    for (const b of buckets) {
      b.saldo = b.receivables - b.payables;
      b.items = b.items.slice(0, 10);
    }
    return buckets;
  });

// ── Alerts ───────────────────────────────────────────────────────────────
export const getAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AlertItem[]> => {
    const { supabase, userId } = context;
    const today = todayISO();
    const alerts: AlertItem[] = [];

    const { data: overdue } = await supabase
      .from("finances")
      .select("id, amount, description, due_date, kind")
      .eq("owner_id", userId)
      .eq("status", "aberto")
      .lt("due_date", today);
    for (const r of (overdue ?? []).slice(0, 5)) {
      alerts.push({
        id: `overdue-${r.id}`,
        level: "red",
        title: r.kind === "receber" ? "Receita vencida" : "Despesa vencida",
        description: `${r.description ?? "—"} • venceu em ${r.due_date}`,
      });
    }

    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const soonISO = soon.toISOString().slice(0, 10);
    const { data: upcoming } = await supabase
      .from("finances")
      .select("id, amount, description, due_date")
      .eq("owner_id", userId)
      .eq("status", "aberto")
      .eq("kind", "receber")
      .gte("due_date", today)
      .lte("due_date", soonISO);
    for (const r of (upcoming ?? []).slice(0, 5)) {
      alerts.push({
        id: `upcoming-${r.id}`,
        level: "yellow",
        title: "Recebimento próximo",
        description: `${r.description ?? "—"} • ${r.due_date}`,
      });
    }

    const renewSoon = new Date();
    renewSoon.setDate(renewSoon.getDate() + 30);
    const { data: contracts } = await supabase
      .from("clients")
      .select("id, name, contract_renewal")
      .eq("owner_id", userId)
      .not("contract_renewal", "is", null)
      .gte("contract_renewal", today)
      .lte("contract_renewal", renewSoon.toISOString().slice(0, 10));
    for (const c of contracts ?? []) {
      alerts.push({
        id: `contract-${c.id}`,
        level: "yellow",
        title: "Contrato próximo do vencimento",
        description: `${c.name} • renova em ${c.contract_renewal}`,
      });
    }

    return alerts;
  });

// ── Categories CRUD ──────────────────────────────────────────────────────
export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FinanceCategory[]> => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("finance_categories")
      .select("id, kind, name, is_default")
      .or(`owner_id.eq.${userId},owner_id.is.null`)
      .order("kind")
      .order("name");
    return (data ?? []).map((c) => ({
      id: c.id,
      kind: c.kind as FinanceKind,
      name: c.name,
      is_default: c.is_default,
    }));
  });

export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid().optional(), kind: kindSchema, name: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.id) {
      await supabase
        .from("finance_categories")
        .update({ name: data.name, kind: data.kind })
        .eq("id", data.id)
        .eq("owner_id", userId);
    } else {
      await supabase
        .from("finance_categories")
        .insert({ owner_id: userId, kind: data.kind, name: data.name, is_default: false });
    }
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("finances")
      .select("id", { count: "exact", head: true })
      .eq("category_id", data.id);
    if ((count ?? 0) > 0) throw new Error("Categoria possui lançamentos vinculados");
    await supabase.from("finance_categories").delete().eq("id", data.id).eq("owner_id", userId);
    return { ok: true };
  });

// ── Recurring contracts list ─────────────────────────────────────────────
export const listRecurringContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("finances")
      .select("id, kind, amount, description, recurrence_day, recurrence_until, due_date, clients(name), projects(name)")
      .eq("owner_id", userId)
      .eq("recurrence", "monthly")
      .is("parent_id", null)
      .order("due_date", { ascending: true });
    return (data ?? []).map((r) => ({
      id: r.id,
      kind: r.kind as FinanceKind,
      amount: Number(r.amount) || 0,
      description: r.description,
      day: (r as { recurrence_day?: number | null }).recurrence_day ?? null,
      until: (r as { recurrence_until?: string | null }).recurrence_until ?? null,
      next: r.due_date as string,
      client_name: (r.clients as { name: string } | null)?.name ?? null,
      project_name: (r.projects as { name: string } | null)?.name ?? null,
    }));
  });

// ── Lookups ──────────────────────────────────────────────────────────────
export const getFinanceFormLookups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [clientsRes, projectsRes, catsRes] = await Promise.all([
      supabase.from("clients").select("id, name").eq("owner_id", userId).order("name"),
      supabase.from("projects").select("id, name, client_id").eq("owner_id", userId).order("name"),
      supabase
        .from("finance_categories")
        .select("id, kind, name")
        .or(`owner_id.eq.${userId},owner_id.is.null`)
        .order("name"),
    ]);
    return {
      clients: (clientsRes.data ?? []) as { id: string; name: string }[],
      projects: (projectsRes.data ?? []) as { id: string; name: string; client_id: string | null }[],
      categories: (catsRes.data ?? []).map((c) => ({ id: c.id, kind: c.kind as FinanceKind, name: c.name })),
    };
  });
