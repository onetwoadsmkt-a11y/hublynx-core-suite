import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Arquivos do card do lead.
 * O envio passa pelo servidor (como os anexos das tarefas): confere o arquivo, guarda no
 * bucket privado "task-attachments" com um caminho sem acentos (`l/<empresa>/<lead>/<id>.<ext>`)
 * e registra em lead_files com as regras do banco de quem envia.
 * Antes o navegador mandava direto para "lead-files" com o nome original no caminho —
 * nomes com acento/ç eram recusados pelo Storage e o erro não aparecia; e só quem enviou
 * conseguia baixar. Arquivos antigos (caminho sem "l/") continuam no bucket "lead-files".
 */
const NEW_BUCKET = "task-attachments";
const OLD_BUCKET = "lead-files";
const bucketOf = (path: string) => (path.startsWith("l/") ? NEW_BUCKET : OLD_BUCKET);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** O lead precisa estar visível para quem pede (regras do banco). */
async function visibleLead(db: any, leadId: string) {
  const { data, error } = await db.from("leads").select("id, organization_id").eq("id", leadId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lead não encontrado ou sem permissão.");
  return data as { id: string; organization_id: string | null };
}

export const uploadLeadFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Envio inválido.");
    const leadId = z.string().uuid().parse(d.get("leadId"));
    const file = d.get("file");
    if (!(file instanceof File)) throw new Error("Selecione um arquivo.");
    return { leadId, file };
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const lead = await visibleLead(db, data.leadId);
    const { readAttachment } = await import("@/lib/projects/attachments.server");
    const f = await readAttachment(data.file); // tamanho, tipo e conteúdo real
    const id = crypto.randomUUID();
    const path = `l/${lead.organization_id ?? "sem-empresa"}/${lead.id}/${id}.${f.ext}`;
    const store = await admin();
    const up = await store.storage.from(NEW_BUCKET).upload(path, f.bytes, { contentType: f.mime, upsert: false });
    if (up.error) throw new Error(`Falha ao guardar o arquivo: ${up.error.message}`);

    const { data: row, error } = await db
      .from("lead_files")
      .insert({
        lead_id: lead.id,
        owner_id: context.userId,
        ...(lead.organization_id ? { organization_id: lead.organization_id } : {}),
        name: f.name,
        storage_path: path,
        mime_type: f.mime,
        size_bytes: f.bytes.length,
      })
      .select("id")
      .maybeSingle();
    if (error || !row) {
      await store.storage.from(NEW_BUCKET).remove([path]).catch(() => null);
      throw new Error(error?.message ?? "Sem permissão para anexar arquivos neste lead.");
    }
    return { ok: true as const, id: row.id as string, name: f.name };
  });

/** Link temporário (5 min) para baixar — vale para toda a equipe que vê o lead. */
export const leadFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: row, error } = await db.from("lead_files").select("id, name, storage_path").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Arquivo não encontrado ou sem permissão.");
    const store = await admin();
    const { data: signed, error: sErr } = await store.storage
      .from(bucketOf(row.storage_path))
      .createSignedUrl(row.storage_path, 300, { download: row.name });
    if (sErr || !signed?.signedUrl) throw new Error("Não foi possível abrir o arquivo agora.");
    return { url: signed.signedUrl as string };
  });

/** Remove o registro (regras do banco de quem pede) e depois o arquivo guardado. */
export const removeLeadFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: gone, error } = await db.from("lead_files").delete().eq("id", data.id).select("storage_path");
    if (error) throw new Error(error.message);
    if (!gone?.length) throw new Error("Sem permissão para remover este arquivo.");
    const path = gone[0].storage_path as string;
    const store = await admin();
    await store.storage.from(bucketOf(path)).remove([path]).catch(() => null);
    return { ok: true as const };
  });
