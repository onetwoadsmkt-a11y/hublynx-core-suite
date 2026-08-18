import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { GOOGLE_API_BASE, googleHeaders } from "@/lib/google/google.functions";

export interface ClientDocument {
  id: string;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string; // Google Drive file id
  created_at: string;
  view_url: string;
}

function driveViewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export const listClientDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("files")
      .select("id, name, mime_type, size_bytes, storage_path, created_at")
      .eq("client_id", data.clientId)
      .eq("category", "contratos")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      documents: (rows ?? []).map((r) => ({
        ...r,
        view_url: driveViewUrl(r.storage_path),
      })) as ClientDocument[],
    };
  });

/**
 * Upload accepts FormData with fields: clientId, file.
 * The file is uploaded to Google Drive via the connector gateway (multipart),
 * then a metadata row is inserted in public.files.
 */
export const uploadClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("FormData esperado");
    const clientId = d.get("clientId");
    const file = d.get("file");
    if (typeof clientId !== "string") throw new Error("clientId ausente");
    if (!(file instanceof File)) throw new Error("Arquivo ausente");
    return { clientId, file };
  })
  .handler(async ({ data, context }) => {
    const { clientId, file } = data;

    // Confirm the client belongs to the user (RLS already enforces this)
    const { data: client, error: cErr } = await context.supabase
      .from("clients")
      .select("id, name")
      .eq("id", clientId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Cliente não encontrado");

    const headers = await googleHeaders(context.userId);

    const boundary = "----hublynx_" + crypto.randomUUID();
    const metadata = {
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      description: `Hublynx · Cliente ${client.name}`,
    };
    const delim = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;
    const metaPart =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata);
    const fileHeader = `${delim}Content-Type: ${metadata.mimeType}\r\n\r\n`;
    const body = new Blob([metaPart, fileHeader, file, closeDelim], {
      type: `multipart/related; boundary=${boundary}`,
    });

    const url =
      `${GOOGLE_API_BASE}/upload/drive/v3/files` +
      `?uploadType=multipart&fields=id,name,mimeType,size,webViewLink`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...(headers as Record<string, string>),
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Falha ao enviar para Google Drive [${res.status}]: ${text.slice(0, 300)}`);
    }
    const drive = (await res.json()) as {
      id: string;
      name: string;
      mimeType?: string;
      size?: string;
      webViewLink?: string;
    };

    const { data: row, error } = await context.supabase
      .from("files")
      .insert({
        owner_id: context.userId,
        client_id: clientId,
        category: "contratos",
        name: drive.name ?? file.name,
        storage_path: drive.id,
        mime_type: drive.mimeType ?? file.type ?? null,
        size_bytes: drive.size ? Number(drive.size) : file.size,
      })
      .select("id, name, mime_type, size_bytes, storage_path, created_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      document: { ...row, view_url: drive.webViewLink ?? driveViewUrl(drive.id) } as ClientDocument,
    };
  });

export const deleteClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error: fErr } = await context.supabase
      .from("files")
      .select("id, storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!row) throw new Error("Documento não encontrado");

    // Best-effort Drive delete (don't fail the row delete if Drive is offline)
    try {
      const headers = await googleHeaders(context.userId);
      await fetch(`${GOOGLE_API_BASE}/drive/v3/files/${row.storage_path}`, {
        method: "DELETE",
        headers: headers as Record<string, string>,
      });
    } catch {
      // ignore
    }

    const { error } = await context.supabase.from("files").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
