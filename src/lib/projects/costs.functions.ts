import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEPARTMENT_PRESETS, BLANK_SHEET, upgradePurchaseSheet, type CostColumn, type SheetInfo } from "./cost-presets";

/** Fase 4 — departamentos e planilhas de custo do projeto (regras de acesso no banco). */

export type CostCell = string | number | boolean | null;
export type CostRow = {
  id: string;
  sheet_id: string;
  position: number;
  data: Record<string, CostCell>;
  updated_at: string;
};
export type CostSheet = {
  id: string;
  department_id: string;
  name: string;
  columns: CostColumn[];
  position: number;
  rows: CostRow[];
  /** cabeçalho/resumo vindos da planilha importada (migração 26) */
  info: SheetInfo;
};
export type CostDepartment = {
  id: string;
  name: string;
  color: string;
  position: number;
  sheets: CostSheet[];
};

const uuid = z.string().uuid();
type Db = { from: (t: string) => any };

const columnSchema: z.ZodType<CostColumn> = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "number", "currency", "percent", "date", "status", "boolean", "calc", "validity"]),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        color: z.string().max(20),
        done: z.boolean().optional(),
      }),
    )
    .max(30)
    .optional(),
  sum: z.boolean().optional(),
  alert: z.boolean().optional(),
  calc: z
    .object({
      op: z.enum(["div", "mul", "sub", "add"]),
      a: z.string().max(40),
      b: z.string().max(40),
      asPercent: z.boolean().optional(),
      asCurrency: z.boolean().optional(),
      expr: z
        .string()
        .max(500)
        .regex(/^[a-z0-9_{}().,+\-*/ ]*$/)
        .optional(),
    })
    .optional(),
  width: z.number().int().min(60).max(600).optional(),
  validity: z.object({ ref: z.string().max(40) }).optional(),
}) as z.ZodType<CostColumn>;

const infoSchema: z.ZodType<SheetInfo> = z.object({
  title: z.string().max(200).optional(),
  fields: z
    .array(z.object({ key: z.string().max(40), label: z.string().max(80), value: z.string().max(500) }))
    .max(30)
    .optional(),
  adjustments: z
    .array(
      z.object({
        key: z.string().max(40),
        label: z.string().max(80),
        value: z.number().nullable(),
        note: z.string().max(80).optional(),
      }),
    )
    .max(10)
    .optional(),
  notes: z.array(z.object({ label: z.string().max(80), value: z.string().max(1000) })).max(20).optional(),
  totalKey: z.string().max(40).optional(),
  // anexos só mudam pelo servidor (sheet-files.functions); o que vier do navegador é ignorado
  attachments: z.array(z.any()).max(100).optional(),
}) as z.ZodType<SheetInfo>;

/** Mantém os anexos que estão no banco (o navegador não grava a lista de anexos). */
async function withStoredAttachments(db: Db, sheetId: string, info: SheetInfo): Promise<SheetInfo> {
  const { data } = await db.from("cost_sheets").select("info").eq("id", sheetId).maybeSingle();
  const stored = ((data as { info?: SheetInfo } | null)?.info?.attachments ?? []) as SheetInfo["attachments"];
  const { attachments: _drop, ...rest } = info;
  return stored && stored.length ? { ...rest, attachments: stored } : rest;
}

/** cost_sheets.info só existe depois da migração 26: grava sem quebrar antes dela. */
async function saveInfo(db: Db, sheetId: string, info: SheetInfo | undefined) {
  if (!info) return true;
  const { error } = await db
    .from("cost_sheets")
    .update({ info: await withStoredAttachments(db, sheetId, info) })
    .eq("id", sheetId);
  return !error;
}

async function projectInfo(db: Db, projectId: string) {
  const { data, error } = await db
    .from("projects")
    .select("id, organization_id, template_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Projeto não encontrado.");
  return data as { id: string; organization_id: string; template_id: string | null };
}

export const listProjectDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<CostDepartment[]> => {
    const db = context.supabase as unknown as Db;
    const { data: depts, error } = await db
      .from("cost_departments")
      .select("id, name, color, position")
      .eq("project_id", data.projectId)
      .order("position");
    if (error) throw new Error(error.message);
    const list = (depts ?? []) as Omit<CostDepartment, "sheets">[];
    if (!list.length) return [];
    const deptIds = list.map((d) => d.id);
    let { data: sheets, error: sErr } = await db
      .from("cost_sheets")
      .select("id, department_id, name, columns, position, info")
      .in("department_id", deptIds)
      .order("position");
    if (sErr) {
      // antes da migração 26 não há a coluna info
      ({ data: sheets, error: sErr } = await db
        .from("cost_sheets")
        .select("id, department_id, name, columns, position")
        .in("department_id", deptIds)
        .order("position"));
    }
    if (sErr) throw new Error(sErr.message);
    const sheetList = (sheets ?? []) as Omit<CostSheet, "rows">[];
    let rows: CostRow[] = [];
    if (sheetList.length) {
      const { data: r, error: rErr } = await db
        .from("cost_sheet_rows")
        .select("id, sheet_id, position, data, updated_at")
        .in(
          "sheet_id",
          sheetList.map((s) => s.id),
        )
        .order("position")
        .order("created_at");
      if (rErr) throw new Error(rErr.message);
      rows = (r ?? []) as CostRow[];
    }
    return list.map((d) => ({
      ...d,
      sheets: sheetList
        .filter((s) => s.department_id === d.id)
        .map((s) => {
          const up = upgradePurchaseSheet(
            s.name,
            (s.columns ?? []) as CostColumn[],
            (s as { info?: SheetInfo }).info,
          );
          return { ...s, columns: up.columns, info: up.info, rows: rows.filter((r) => r.sheet_id === s.id) };
        }),
    }));
  });

export const createDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        name: z.string().trim().min(1).max(80),
        color: z.string().max(20).default("#2563eb"),
        preset: z.string().max(40).optional(),
        /** sem a planilha em branco (usado ao importar um arquivo) */
        empty: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const p = await projectInfo(db, data.projectId);
    const { count } = await db
      .from("cost_departments")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.projectId);
    const preset = data.preset ? DEPARTMENT_PRESETS.find((x) => x.key === data.preset) : null;
    const { data: dept, error } = await db
      .from("cost_departments")
      .insert({
        organization_id: p.organization_id,
        project_id: data.projectId,
        name: data.name,
        color: preset?.color ?? data.color,
        position: count ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const sheets = preset ? preset.sheets : data.empty ? [] : [BLANK_SHEET];
    if (!sheets.length) return { id: dept.id as string };
    const { error: sErr } = await db.from("cost_sheets").insert(
      sheets.map((s, i) => ({
        organization_id: p.organization_id,
        department_id: dept.id,
        name: s.name,
        columns: s.columns,
        position: i,
      })),
    );
    if (sErr) throw new Error(sErr.message);
    return { id: dept.id as string };
  });

export const updateDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: uuid, name: z.string().trim().min(1).max(80), color: z.string().max(20) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: row, error } = await db
      .from("cost_departments")
      .update({ name: data.name, color: data.color })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sem permissão para alterar o departamento.");
    return { ok: true as const };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: row, error } = await db
      .from("cost_departments")
      .delete()
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sem permissão para excluir o departamento.");
    return { ok: true as const };
  });

export const saveSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        departmentId: uuid,
        name: z.string().trim().min(1).max(80),
        columns: z.array(columnSchema).min(1).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    if (data.id) {
      const { data: row, error } = await db
        .from("cost_sheets")
        .update({ name: data.name, columns: data.columns })
        .eq("id", data.id)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Sem permissão para alterar a planilha.");
      return { id: data.id };
    }
    const { data: dept, error: dErr } = await db
      .from("cost_departments")
      .select("organization_id")
      .eq("id", data.departmentId)
      .maybeSingle();
    if (dErr || !dept) throw new Error("Departamento não encontrado.");
    const { count } = await db
      .from("cost_sheets")
      .select("id", { count: "exact", head: true })
      .eq("department_id", data.departmentId);
    const { data: row, error } = await db
      .from("cost_sheets")
      .insert({
        organization_id: dept.organization_id,
        department_id: data.departmentId,
        name: data.name,
        columns: data.columns,
        position: count ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: row, error } = await db
      .from("cost_sheets")
      .delete()
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sem permissão para excluir a planilha.");
    return { ok: true as const };
  });

export const saveRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        sheetId: uuid,
        data: z.record(
          z.string().max(64), // colunas + cores ("__cor", "__cor:<coluna>")
          z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
        ),
        position: z.number().int().min(0).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    if (data.id) {
      const { data: row, error } = await db
        .from("cost_sheet_rows")
        .update({ data: data.data, updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Sem permissão para alterar a linha.");
      return { id: data.id };
    }
    const { data: sheet, error: sErr } = await db
      .from("cost_sheets")
      .select("organization_id")
      .eq("id", data.sheetId)
      .maybeSingle();
    if (sErr || !sheet) throw new Error("Planilha não encontrada.");
    const { count } = await db
      .from("cost_sheet_rows")
      .select("id", { count: "exact", head: true })
      .eq("sheet_id", data.sheetId);
    const { data: row, error } = await db
      .from("cost_sheet_rows")
      .insert({
        organization_id: sheet.organization_id,
        sheet_id: data.sheetId,
        data: data.data,
        position: data.position ?? count ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: row, error } = await db
      .from("cost_sheet_rows")
      .delete()
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sem permissão para excluir a linha.");
    return { ok: true as const };
  });

/** Copia departamentos e planilhas (sem as linhas) do modelo de projeto para este projeto. */
export const loadTemplateDepartments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const p = await projectInfo(db, data.projectId);
    if (!p.template_id) throw new Error("Este projeto não foi criado a partir de um modelo.");
    const { copyTemplateDepartmentsToProject } = await import("./costs.server");
    const added = await copyTemplateDepartmentsToProject(db, {
      templateId: p.template_id,
      projectId: p.id,
      organizationId: p.organization_id,
    });
    return { added };
  });

/** Salva a estrutura deste projeto como padrão do modelo (só administrador). */
export const saveDepartmentsToTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, templateId: uuid.optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db & {
      rpc: (f: string, a: Record<string, unknown>) => any;
    };
    const p = await projectInfo(db, data.projectId);
    const templateId = data.templateId ?? p.template_id;
    if (!templateId) throw new Error("Escolha o modelo de projeto que vai receber a estrutura.");
    const { data: isAdmin } = await db.rpc("is_org_admin", { _org: p.organization_id });
    if (isAdmin !== true) throw new Error("Somente o administrador da empresa altera os modelos.");
    const { replaceTemplateDepartmentsFromProject } = await import("./costs.server");
    const count = await replaceTemplateDepartmentsFromProject(db, {
      templateId,
      projectId: p.id,
      organizationId: p.organization_id,
    });
    return { count };
  });

/** Importa uma planilha (Excel/CSV já convertido no navegador): cria a aba com as colunas e grava as linhas. */
export const importSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        departmentId: uuid,
        name: z.string().trim().min(1).max(80),
        columns: z.array(columnSchema).min(1).max(40),
        rows: z
          .array(
            z.record(
              z.string().max(40),
              z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
            ),
          )
          .max(2000),
        info: infoSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: dept, error: dErr } = await db
      .from("cost_departments")
      .select("organization_id")
      .eq("id", data.departmentId)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!dept) throw new Error("Departamento não encontrado.");
    const { count } = await db
      .from("cost_sheets")
      .select("id", { count: "exact", head: true })
      .eq("department_id", data.departmentId);
    const { data: sheet, error } = await db
      .from("cost_sheets")
      .insert({
        organization_id: dept.organization_id,
        department_id: data.departmentId,
        name: data.name,
        columns: data.columns,
        position: count ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Sem permissão para criar a planilha: ${error.message}`);
    const keys = new Set(data.columns.map((c) => c.key));
    const rows = data.rows.map((r, i) => ({
      organization_id: dept.organization_id,
      sheet_id: sheet.id,
      position: i,
      data: Object.fromEntries(Object.entries(r).filter(([k]) => keys.has(k))),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: rErr } = await db.from("cost_sheet_rows").insert(rows.slice(i, i + 500));
      if (rErr) {
        // não deixa uma aba pela metade
        await db.from("cost_sheets").delete().eq("id", sheet.id);
        throw new Error(`Não foi possível gravar as linhas: ${rErr.message}`);
      }
    }
    const infoSaved = await saveInfo(db, sheet.id as string, data.info);
    return { id: sheet.id as string, rows: rows.length, infoSaved };
  });

/**
 * Importa uma planilha DENTRO de uma aba que já existe (ex.: "Itens comprados"):
 * as colunas passam a ser as do arquivo (com as fórmulas como colunas calculadas)
 * e os lançamentos são substituídos ou somados aos que já existem.
 */
export const replaceSheetFromImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sheetId: uuid,
        columns: z.array(columnSchema).min(1).max(40),
        rows: z
          .array(
            z.record(
              z.string().max(40),
              z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
            ),
          )
          .max(2000),
        mode: z.enum(["replace", "append"]).default("replace"),
        info: infoSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: sheet, error: sErr } = await db
      .from("cost_sheets")
      .select("id, organization_id, columns")
      .eq("id", data.sheetId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sheet) throw new Error("Planilha não encontrada.");
    const before = sheet.columns as CostColumn[];
    const { data: upd, error: uErr } = await db
      .from("cost_sheets")
      .update({ columns: data.columns })
      .eq("id", data.sheetId)
      .select("id")
      .maybeSingle();
    if (uErr) throw new Error(uErr.message);
    if (!upd) throw new Error("Sem permissão para alterar a planilha.");
    let start = 0;
    if (data.mode === "replace") {
      const { error: dErr } = await db.from("cost_sheet_rows").delete().eq("sheet_id", data.sheetId);
      if (dErr) {
        await db.from("cost_sheets").update({ columns: before }).eq("id", data.sheetId);
        throw new Error(`Não foi possível limpar os lançamentos: ${dErr.message}`);
      }
    } else {
      const { count } = await db
        .from("cost_sheet_rows")
        .select("id", { count: "exact", head: true })
        .eq("sheet_id", data.sheetId);
      start = count ?? 0;
    }
    const keys = new Set(data.columns.map((c) => c.key));
    const rows = data.rows.map((r, i) => ({
      organization_id: sheet.organization_id,
      sheet_id: data.sheetId,
      position: start + i,
      data: Object.fromEntries(Object.entries(r).filter(([k]) => keys.has(k))),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: rErr } = await db.from("cost_sheet_rows").insert(rows.slice(i, i + 500));
      if (rErr) throw new Error(`Colunas atualizadas, mas houve erro ao gravar as linhas: ${rErr.message}`);
    }
    const infoSaved = await saveInfo(db, data.sheetId, data.info);
    return { rows: rows.length, infoSaved };
  });

/** Edita os dados do cabeçalho/resumo da planilha (Nº, data, contato, frete, ST…). */
export const saveSheetInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheetId: uuid, info: infoSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: row, error } = await db
      .from("cost_sheets")
      .update({ info: await withStoredAttachments(db, data.sheetId, data.info) })
      .eq("id", data.sheetId)
      .select("id")
      .maybeSingle();
    if (error) {
      if (/info/.test(error.message)) throw new Error("Rode a migração 26 no banco para salvar estes dados.");
      throw new Error(error.message);
    }
    if (!row) throw new Error("Sem permissão para alterar a planilha.");
    return { ok: true as const };
  });
