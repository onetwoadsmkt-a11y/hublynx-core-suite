import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

type EntityType = "task" | "client" | "project";

type EntityDef = {
  table: string;
  title: string;
  select: string;
  headers: string[];
  toRow: (record: any) => (string | number | null)[];
};

const ENTITY_DEFS: Record<EntityType, EntityDef> = {
  task: {
    table: "tasks",
    title: "Hublynx — Tarefas",
    select:
      "id,title,status,priority,due_date,created_at,updated_at,project:projects(name),client:clients(name)",
    headers: [
      "ID", "Título", "Status", "Prioridade", "Projeto", "Cliente",
      "Prazo", "Criado em", "Atualizado em",
    ],
    toRow: (r) => [
      r.id ?? "",
      r.title ?? "",
      r.status ?? "",
      r.priority ?? "",
      r.project?.name ?? "",
      r.client?.name ?? "",
      r.due_date ?? "",
      r.created_at ?? "",
      r.updated_at ?? "",
    ],
  },
  client: {
    table: "clients",
    title: "Hublynx — Clientes",
    select: "id,name,company,email,phone,status,service,monthly_value,created_at,updated_at",
    headers: [
      "ID", "Nome", "Empresa", "E-mail", "Telefone",
      "Status", "Serviço", "Mensalidade", "Criado em", "Atualizado em",
    ],
    toRow: (r) => [
      r.id ?? "",
      r.name ?? "",
      r.company ?? "",
      r.email ?? "",
      r.phone ?? "",
      r.status ?? "",
      r.service ?? "",
      r.monthly_value ?? "",
      r.created_at ?? "",
      r.updated_at ?? "",
    ],
  },
  project: {
    table: "projects",
    title: "Hublynx — Projetos",
    select:
      "id,name,status,progress,created_at,updated_at,client:clients(name)",
    headers: [
      "ID", "Nome", "Status", "Progresso", "Cliente", "Criado em", "Atualizado em",
    ],
    toRow: (r) => [
      r.id ?? "",
      r.name ?? "",
      r.status ?? "",
      r.progress ?? "",
      r.client?.name ?? "",
      r.created_at ?? "",
      r.updated_at ?? "",
    ],
  },
};

function getEnv() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovableKey || !sheetsKey) {
    throw new Error("Conector Google Sheets não configurado.");
  }
  return { lovableKey, sheetsKey };
}

async function gatewayFetch(path: string, init: RequestInit = {}) {
  const { lovableKey, sheetsKey } = getEnv();
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Sheets [${res.status}]: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function ensureSpreadsheet(supabase: any, entityType: EntityType) {
  const def = ENTITY_DEFS[entityType];
  const { data: existing } = await supabase
    .from("google_sheets_sync")
    .select("*")
    .eq("entity_type", entityType)
    .maybeSingle();

  if (existing?.spreadsheet_id) {
    return existing;
  }

  // Create new spreadsheet with headers
  const created = await gatewayFetch("/spreadsheets", {
    method: "POST",
    body: JSON.stringify({
      properties: { title: def.title },
      sheets: [{ properties: { title: "Sheet1" } }],
    }),
  });
  const spreadsheetId: string = created.spreadsheetId;
  const spreadsheetUrl: string =
    created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Write headers
  await gatewayFetch(
    `/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [def.headers] }),
    },
  );

  const { data: saved, error } = await supabase
    .from("google_sheets_sync")
    .insert({
      entity_type: entityType,
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: spreadsheetUrl,
      sheet_name: "Sheet1",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return saved;
}

async function findRowIndex(spreadsheetId: string, sheetName: string, recordId: string) {
  const data = await gatewayFetch(
    `/spreadsheets/${spreadsheetId}/values/${sheetName}!A:A`,
  );
  const values: string[][] = data.values ?? [];
  for (let i = 0; i < values.length; i++) {
    if ((values[i]?.[0] ?? "") === recordId) return i + 1; // 1-indexed
  }
  return null;
}

export const syncEntityToSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entityType: z.enum(["task", "client", "project"]),
        recordId: z.string().min(1).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const def = ENTITY_DEFS[data.entityType as EntityType];
    const { data: record, error } = await (context.supabase as any)
      .from(def.table)
      .select(def.select)
      .eq("id", data.recordId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!record) return { ok: false as const, reason: "not_found" };

    const cfg = await ensureSpreadsheet(context.supabase, data.entityType as EntityType);
    const row = def.toRow(record);
    const sheetName = cfg.sheet_name ?? "Sheet1";

    const rowIndex = await findRowIndex(cfg.spreadsheet_id, sheetName, data.recordId);
    if (rowIndex) {
      await gatewayFetch(
        `/spreadsheets/${cfg.spreadsheet_id}/values/${sheetName}!A${rowIndex}?valueInputOption=USER_ENTERED`,
        { method: "PUT", body: JSON.stringify({ values: [row] }) },
      );
    } else {
      await gatewayFetch(
        `/spreadsheets/${cfg.spreadsheet_id}/values/${sheetName}!A:A:append?valueInputOption=USER_ENTERED`,
        { method: "POST", body: JSON.stringify({ values: [row] }) },
      );
    }
    return { ok: true as const, spreadsheetUrl: cfg.spreadsheet_url };
  });

export const deleteEntityRowFromSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entityType: z.enum(["task", "client", "project"]),
        recordId: z.string().min(1).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: cfg } = await context.supabase
      .from("google_sheets_sync")
      .select("*")
      .eq("entity_type", data.entityType)
      .maybeSingle();
    if (!cfg?.spreadsheet_id) return { ok: true as const };
    const sheetName = cfg.sheet_name ?? "Sheet1";
    const rowIndex = await findRowIndex(cfg.spreadsheet_id, sheetName, data.recordId);
    if (!rowIndex) return { ok: true as const };
    // Clear the row contents (keep row to avoid shifting refs)
    await gatewayFetch(
      `/spreadsheets/${cfg.spreadsheet_id}/values/${sheetName}!A${rowIndex}:Z${rowIndex}:clear`,
      { method: "POST", body: JSON.stringify({}) },
    );
    return { ok: true as const };
  });

export const listSheetsSync = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("google_sheets_sync")
      .select("*");
    if (error) throw new Error(error.message);
    return { configs: data ?? [] };
  });
