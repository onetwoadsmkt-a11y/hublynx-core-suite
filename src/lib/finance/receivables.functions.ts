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
