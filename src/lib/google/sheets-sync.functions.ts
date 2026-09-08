import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { GOOGLE_API_BASE, googleHeaders } from "./google.functions";

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

const SHEETS_API_BASE = `${GOOGLE_API_BASE}/sheets/v4`;

async function sheetsFetch(userId: string, path: string, init: RequestInit = {}) {
  const headers = await googleHeaders(userId);
  const res = await fetch(`${SHEETS_API_BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
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

async function ensureSpreadsheet(supabase: any, userId: string, entityType: EntityType) {
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
  const created = await sheetsFetch(userId, "/spreadsheets", {
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
  await sheetsFetch(
    userId,
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

async function findRowIndex(userId: string, spreadsheetId: string, sheetName: string, recordId: string) {
  const data = await sheetsFetch(
    userId,
    `/spreadsheets/${spreadsheetId}/values/${sheetName}!A:A`,
  );
  const values: string[][] = data.values ?? [];
  for (let i = 0; i < values.length; i++) {
    if ((values[i]?.[0] ?? "") === recordId) return i + 1; // 1-indexed
  }
  return null;
}

export async function performSheetsSync(
  supabase: any,
  userId: string,
  entityType: EntityType,
  recordId: string,
) {
  const def = ENTITY_DEFS[entityType];
  const { data: record, error } = await supabase
    .from(def.table)
    .select(def.select)
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!record) return { ok: false as const, reason: "not_found" };

  const cfg = await ensureSpreadsheet(supabase, userId, entityType);
  const row = def.toRow(record);
  const sheetName = cfg.sheet_name ?? "Sheet1";

  const rowIndex = await findRowIndex(userId, cfg.spreadsheet_id, sheetName, recordId);
  if (rowIndex) {
    await sheetsFetch(
      userId,
      `/spreadsheets/${cfg.spreadsheet_id}/values/${sheetName}!A${rowIndex}?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [row] }) },
    );
  } else {
    await sheetsFetch(
      userId,
      `/spreadsheets/${cfg.spreadsheet_id}/values/${sheetName}!A:A:append?valueInputOption=USER_ENTERED`,
      { method: "POST", body: JSON.stringify({ values: [row] }) },
    );
  }
  return { ok: true as const, spreadsheetUrl: cfg.spreadsheet_url };
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
    try {
      return await performSheetsSync(context.supabase, context.userId, data.entityType as EntityType, data.recordId);
    } catch (e: any) {
      console.warn("[sheets-sync] skipped:", e?.message ?? e);
      return { ok: false as const, reason: "sync_failed", message: String(e?.message ?? e).slice(0, 200) };
    }
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
    const rowIndex = await findRowIndex(context.userId, cfg.spreadsheet_id, sheetName, data.recordId);
    if (!rowIndex) return { ok: true as const };
    // Clear the row contents (keep row to avoid shifting refs)
    await sheetsFetch(
      context.userId,
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
