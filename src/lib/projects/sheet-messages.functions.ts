import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Planilhas do Comercial no portal do cliente (migração 36):
 * liberar a planilha para o cliente ver e a conversa no rodapé da planilha (lado da equipe).
 */

export type SheetMessage = {
  id: string;
  sheet_id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author_kind: "equipe" | "cliente";
  author: string;
  recipient_id: string | null;
  recipient: string | null;
};

const uuid = z.string().uuid();
type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
const MIGRATION = "Rode a migração 36 no banco para usar as planilhas no portal.";

async function sheetProject(db: Db, sheetId: string): Promise<string> {
  const { data, error } = await db
    .from("cost_sheets")
    .select("id, cost_departments!inner(project_id)")
    .eq("id", sheetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const pid = (data as any)?.cost_departments?.project_id as string | undefined;
  if (!pid) throw new Error("Planilha não encontrada (ou é de um modelo).");
  return pid;
}

/** Liga/desliga "Liberar para o cliente" (só ver, no portal). */
export const setSheetPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheetId: uuid, visible: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const projectId = await sheetProject(db, data.sheetId);
    const { data: ok } = await db.rpc("can_edit_project", { _project: projectId });
    if (!ok) throw new Error("Só quem edita o projeto pode liberar a planilha para o cliente.");
    const { error } = await db.from("cost_sheets").update({ portal_visible: data.visible }).eq("id", data.sheetId);
    if (error) throw new Error(/portal_visible/.test(error.message) ? MIGRATION : error.message);
    return { ok: true as const };
  });

async function withNames(db: Db, rows: any[]): Promise<SheetMessage[]> {
  const ids = [...new Set(rows.flatMap((r) => [r.author_id, r.recipient_id]).filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await db.from("profiles").select("id, full_name").in("id", ids);
    for (const p of (data ?? []) as any[]) if (p.full_name) names.set(p.id, p.full_name);
  }
  return rows.map((r) => ({
    id: r.id,
    sheet_id: r.sheet_id,
    body: r.body,
    created_at: r.created_at,
    author_id: r.author_id,
    author_kind: r.author_kind,
    author: (r.author_id && names.get(r.author_id)) || (r.author_kind === "cliente" ? "Cliente" : "Equipe"),
    recipient_id: r.recipient_id,
    recipient: r.recipient_id ? names.get(r.recipient_id) ?? "pessoa da equipe" : null,
  }));
}

export const listSheetMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheetId: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<{ ready: boolean; messages: SheetMessage[] }> => {
    const db = context.supabase as unknown as Db;
    const { data: rows, error } = await db
      .from("cost_sheet_messages")
      .select("id, sheet_id, body, created_at, author_id, author_kind, recipient_id")
      .eq("sheet_id", data.sheetId)
      .order("created_at");
    if (error) return { ready: false, messages: [] }; // antes da migração 36
    return { ready: true, messages: await withNames(db, rows ?? []) };
  });

export const sendSheetMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheetId: uuid, body: z.string().trim().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const projectId = await sheetProject(db, data.sheetId);
    const { error } = await db.from("cost_sheet_messages").insert({
      sheet_id: data.sheetId,
      project_id: projectId,
      author_id: context.userId,
      author_kind: "equipe",
      body: data.body,
    });
    if (error) throw new Error(/cost_sheet_messages/.test(error.message) ? MIGRATION : error.message);
    return { ok: true as const };
  });

export const deleteSheetMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { error } = await db.from("cost_sheet_messages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
