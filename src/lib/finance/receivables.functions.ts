import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReceivableMatrixRow = {
  key: string;
  client: string;
  project: string;
  months: number[];
  received: number[];
  total: number;
};

export type ReceivablesPanel = {
  labels: string[];
  rows: ReceivableMatrixRow[];
  previsto: number[];
  recebido: number[];
  aberto: number[];
  count: number[];
  totalPrevisto: number;
  totalRecebido: number;
  totalAberto: number;
};

export const getReceivablesPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        startYear: z.number().int().min(2000).max(2100),
        startMonth: z.number().int().min(1).max(12),
        months: z.number().int().min(1).max(24).default(13),
        kind: z.enum(["receber", "pagar"]).default("receber"),
        clientId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ReceivablesPanel> => {
    const { supabase, userId } = context;
    const start = new Date(Date.UTC(data.startYear, data.startMonth - 1, 1));
    const end = new Date(Date.UTC(data.startYear, data.startMonth - 1 + data.months, 0));
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);

    const labels: string[] = [];
    const keys: string[] = [];
    for (let i = 0; i < data.months; i++) {
      const d = new Date(Date.UTC(data.startYear, data.startMonth - 1 + i, 1));
      keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
      labels.push(
        d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "") +
          "/" +
          String(d.getUTCFullYear()).slice(2),
      );
    }
    const idx = new Map(keys.map((k, i) => [k, i]));

    let q = supabase
      .from("finances")
      .select("amount, due_date, status, client_id, project_id, description, category_id")
      .eq("owner_id", userId)
      .eq("kind", data.kind)
      .gte("due_date", from)
      .lte("due_date", to);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const [{ data: clients }, { data: projects }] = await Promise.all([
      supabase.from("clients").select("id, name").eq("owner_id", userId),
      supabase.from("projects").select("id, name").eq("owner_id", userId),
    ]);
    const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
    const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));

    const map = new Map<string, ReceivableMatrixRow>();
    const previsto = new Array(data.months).fill(0) as number[];
    const recebido = new Array(data.months).fill(0) as number[];
    const count = new Array(data.months).fill(0) as number[];

    for (const r of rows ?? []) {
      const mk = String(r.due_date).slice(0, 7);
      const i = idx.get(mk);
      if (i === undefined) continue;
      const amount = Number(r.amount) || 0;
      const cName = r.client_id ? (clientName.get(r.client_id) ?? "—") : "Sem cliente";
      const pName = r.project_id
        ? (projectName.get(r.project_id) ?? "—")
        : r.description || "Avulso";
      const key = `${r.client_id ?? "none"}::${r.project_id ?? pName}`;
      let row = map.get(key);
      if (!row) {
        row = {
          key,
          client: cName,
          project: pName,
          months: new Array(data.months).fill(0),
          received: new Array(data.months).fill(0),
          total: 0,
        };
        map.set(key, row);
      }
      row.months[i] = (row.months[i] ?? 0) + amount;
      row.total += amount;
      previsto[i] = (previsto[i] ?? 0) + amount;
      count[i] = (count[i] ?? 0) + 1;
      if (r.status === "pago") {
        row.received[i] = (row.received[i] ?? 0) + amount;
        recebido[i] = (recebido[i] ?? 0) + amount;
      }
    }

    const aberto = previsto.map((v, i) => v - (recebido[i] ?? 0));
    const list = [...map.values()].sort(
      (a, b) => a.client.localeCompare(b.client) || a.project.localeCompare(b.project),
    );

    return {
      labels,
      rows: list,
      previsto,
      recebido,
      aberto,
      count,
      totalPrevisto: previsto.reduce((a, b) => a + b, 0),
      totalRecebido: recebido.reduce((a, b) => a + b, 0),
      totalAberto: aberto.reduce((a, b) => a + b, 0),
    };
  });

/* ---------------------------------------------------------------------------
 * Previsão de faturamento — gerada a partir dos contratos recorrentes
 * ------------------------------------------------------------------------- */

const RECURRING_MODELS = ["mensal_recorrente", "suporte_continuo"];

export type ForecastRow = {
  projectId: string;
  project: string;
  client: string;
  monthlyValue: number;
  billingDay: number;
  forecast: number[];
  booked: number[];
  missing: string[];
  total: number;
};

export type BillingForecast = {
  labels: string[];
  monthKeys: string[];
  rows: ForecastRow[];
  totalForecast: number[];
  totalBooked: number[];
  grandForecast: number;
  grandBooked: number;
};

function monthGrid(startYear: number, startMonth: number, months: number) {
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

export const getBillingForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        startYear: z.number().int().min(2000).max(2100),
        startMonth: z.number().int().min(1).max(12),
        months: z.number().int().min(1).max(24).default(12),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<BillingForecast> => {
    const { supabase, userId } = context;
    const { keys, labels } = monthGrid(data.startYear, data.startMonth, data.months);
    const idx = new Map(keys.map((k, i) => [k, i]));
    const from = `${keys[0]}-01`;
    const lastKey = keys[keys.length - 1]!;
    const lastEnd = new Date(Date.UTC(Number(lastKey.slice(0, 4)), Number(lastKey.slice(5, 7)), 0));
    const to = lastEnd.toISOString().slice(0, 10);

    const [{ data: projects }, { data: clients }, { data: finances }] = await Promise.all([
      supabase
        .from("projects")
        .select("id, name, client_id, monthly_value, billing_day, commercial_model, status")
        .eq("owner_id", userId),
      supabase.from("clients").select("id, name").eq("owner_id", userId),
      supabase
        .from("finances")
        .select("amount, due_date, project_id")
        .eq("owner_id", userId)
        .eq("kind", "receber")
        .gte("due_date", from)
        .lte("due_date", to),
    ]);

    const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
    const bookedByProject = new Map<string, number[]>();
    for (const f of finances ?? []) {
      if (!f.project_id) continue;
      const i = idx.get(String(f.due_date).slice(0, 7));
      if (i === undefined) continue;
      let arr = bookedByProject.get(f.project_id);
      if (!arr) {
        arr = new Array(data.months).fill(0);
        bookedByProject.set(f.project_id, arr);
      }
      arr[i] = (arr[i] ?? 0) + (Number(f.amount) || 0);
    }

    const rows: ForecastRow[] = [];
    const totalForecast = new Array(data.months).fill(0) as number[];
    const totalBooked = new Array(data.months).fill(0) as number[];

    for (const p of projects ?? []) {
      const model = p.commercial_model ?? "projeto_fechado";
      const monthly = Number(p.monthly_value ?? 0);
      const active = !["concluido", "cancelado"].includes(String(p.status));
      if (!RECURRING_MODELS.includes(model) || monthly <= 0 || !active) continue;

      const booked = bookedByProject.get(p.id) ?? new Array(data.months).fill(0);
      const forecast = new Array(data.months).fill(monthly) as number[];
      const missing: string[] = [];
      forecast.forEach((v, i) => {
        totalForecast[i] = (totalForecast[i] ?? 0) + v;
        totalBooked[i] = (totalBooked[i] ?? 0) + (booked[i] ?? 0);
        if ((booked[i] ?? 0) <= 0) missing.push(keys[i]!);
      });

      rows.push({
        projectId: p.id,
        project: p.name,
        client: p.client_id ? (clientName.get(p.client_id) ?? "—") : "Sem cliente",
        monthlyValue: monthly,
        billingDay: Number(p.billing_day ?? 5),
        forecast,
        booked,
        missing,
        total: monthly * data.months,
      });
    }

    rows.sort((a, b) => a.client.localeCompare(b.client) || a.project.localeCompare(b.project));

    return {
      labels,
      monthKeys: keys,
      rows,
      totalForecast,
      totalBooked,
      grandForecast: totalForecast.reduce((a, b) => a + b, 0),
      grandBooked: totalBooked.reduce((a, b) => a + b, 0),
    };
  });

/** Cria as cobranças previstas que ainda não existem para um projeto recorrente. */
export const generateForecastCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        monthKeys: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1).max(24),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ created: number }> => {
    const { supabase, userId } = context;
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, name, client_id, monthly_value, billing_day")
      .eq("id", data.projectId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Projeto não encontrado.");

    const amount = Number(project.monthly_value ?? 0);
    if (amount <= 0) throw new Error("Projeto sem valor mensal definido.");
    const day = Math.min(Math.max(Number(project.billing_day ?? 5), 1), 28);

    const dues = data.monthKeys.map((k) => `${k}-${String(day).padStart(2, "0")}`);
    const { data: existing } = await supabase
      .from("finances")
      .select("due_date")
      .eq("owner_id", userId)
      .eq("kind", "receber")
      .eq("project_id", project.id)
      .gte("due_date", `${data.monthKeys[0]}-01`);
    const existingMonths = new Set((existing ?? []).map((r) => String(r.due_date).slice(0, 7)));

    const rows = dues
      .filter((d) => !existingMonths.has(d.slice(0, 7)))
      .map((due_date) => ({
        owner_id: userId,
        kind: "receber" as const,
        client_id: project.client_id,
        project_id: project.id,
        description: project.name,
        amount,
        due_date,
        status: "pendente" as const,
      }));

    if (rows.length === 0) return { created: 0 };
    const { error } = await supabase.from("finances").insert(rows);
    if (error) throw new Error(error.message);
    return { created: rows.length };
  });
