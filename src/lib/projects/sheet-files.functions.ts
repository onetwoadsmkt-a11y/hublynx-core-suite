import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SheetAttachment, SheetInfo } from "./cost-presets";

/**
 * Anexos das planilhas de custo (ex.: o Excel que foi importado na aba).
 * O arquivo vai para o bucket privado dos anexos; a lista fica em cost_sheets.info.attachments.
 * Ver/baixar segue quem enxerga a planilha; anexar/remover segue quem pode editá-la
 * (a gravação do info passa pelas regras do banco com o usuário logado).
 */

type Db = { from: (t: string) => any; rpc: (fn: string, a?: Record<string, unknown>) => any };
const uuid = z.string().uuid();

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db & { storage: any };
}

async function sheetOf(db: Db, sheetId: string) {
  const { data, error } = await db
    .from("cost_sheets")
    .select("id, organization_id, department_id, info")
    .eq("id", sheetId)
    .maybeSingle();
  if (error) {
    if (/info/.test(error.message)) throw new Error("Rode a migração 26 no banco para usar os anexos da planilha.");
    throw new Error(error.message);
  }
  if (!data) throw new Error("Planilha não encontrada.");
  return data as { id: string; organization_id: string; department_id: string; info: SheetInfo | null };
}

async function writeList(db: Db, sheetId: string, info: SheetInfo, list: SheetAttachment[]) {
  const { data, error } = await db
    .from("cost_sheets")
    .update({ info: { ...info, attachments: list } })
    .eq("id", sheetId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissão para alterar os anexos desta planilha.");
}

export const uploadSheetFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Envio inválido.");
    const sheetId = uuid.parse(d.get("sheetId"));
    const file = d.get("file");
    if (!(file instanceof File)) throw new Error("Selecione um arquivo.");
    return { sheetId, file, imported: d.get("imported") === "1", order: d.get("order") === "1" };
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const sheet = await sheetOf(db, data.sheetId);
    const { readAttachment, ATTACHMENT_BUCKET } = await import("./attachments.server");
    const f = await readAttachment(data.file);
    const ad = await admin();
    const id = crypto.randomUUID();
    const path = `s/${sheet.organization_id}/${sheet.id}/${id}.${f.ext}`;
    const up = await ad.storage.from(ATTACHMENT_BUCKET).upload(path, f.bytes, { contentType: f.mime, upsert: false });
    if (up.error) throw new Error(`Não foi possível guardar o arquivo: ${up.error.message}`);
    const { data: prof } = await ad.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const item: SheetAttachment = {
      id,
      name: f.name,
      size: f.bytes.length,
      mime: f.mime,
      path,
      uploaded_at: new Date().toISOString(),
      uploaded_by: context.userId,
      author: (prof?.full_name as string | undefined) || "Equipe",
      ...(data.imported ? { imported: true } : {}),
      ...(data.order ? { order: true } : {}),
    };
    const info = sheet.info ?? {};
    const current = info.attachments ?? [];
    // um pedido por planilha: o novo substitui o anterior
    const oldOrders = data.order ? current.filter((a) => a.order) : [];
    try {
      await writeList(db, sheet.id, info, [...current.filter((a) => !oldOrders.includes(a)), item]);
    } catch (e) {
      await ad.storage.from(ATTACHMENT_BUCKET).remove([path]);
      throw e;
    }
    if (oldOrders.length) await ad.storage.from(ATTACHMENT_BUCKET).remove(oldOrders.map((a) => a.path));
    return item;
  });

export const sheetFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheetId: uuid, fileId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sheet = await sheetOf(context.supabase as unknown as Db, data.sheetId);
    const file = (sheet.info?.attachments ?? []).find((a) => a.id === data.fileId);
    if (!file) throw new Error("Arquivo não encontrado.");
    const { signedDownloadUrl } = await import("./attachments.server");
    return { url: await signedDownloadUrl(await admin(), file.path, file.name) };
  });

export const removeSheetFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheetId: uuid, fileId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const sheet = await sheetOf(db, data.sheetId);
    const list = sheet.info?.attachments ?? [];
    const file = list.find((a) => a.id === data.fileId);
    if (!file) return { ok: true as const };
    await writeList(db, sheet.id, sheet.info ?? {}, list.filter((a) => a.id !== data.fileId));
    const { ATTACHMENT_BUCKET } = await import("./attachments.server");
    await (await admin()).storage.from(ATTACHMENT_BUCKET).remove([file.path]);
    return { ok: true as const };
  });
