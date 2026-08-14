// Server-only — acesso privilegiado à tabela de conexões por usuário.
import { encryptConnectionKey, decryptConnectionKey } from "./connectionKeyCrypto";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (t: string) => any;
  };
}

export async function saveConnectionKeyForUser(
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
  accountEmail?: string | null,
) {
  const db = await admin();
  const { error } = await db.from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
      account_email: accountEmail ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw error;
}

export async function getConnectionKeyForUser(userId: string, connectorId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("app_user_connections")
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  return data ? decryptConnectionKey(data.connection_key_ciphertext) : null;
}

export async function listUserConnections(userId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("app_user_connections")
    .select("connector_id, account_email, updated_at")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as Array<{
    connector_id: string;
    account_email: string | null;
    updated_at: string;
  }>;
}

export async function deleteConnectionForUser(userId: string, connectorId: string) {
  const db = await admin();
  const { error } = await db
    .from("app_user_connections")
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
  if (error) throw error;
}

export async function setConnectionEmail(
  userId: string,
  connectorId: string,
  email: string | null,
) {
  const db = await admin();
  await db
    .from("app_user_connections")
    .update({ account_email: email })
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
}

export type OAuthLogAction = "connect_start" | "connect_complete" | "test" | "disconnect";

/** Registra um evento de OAuth do usuário (nunca guarda segredos). */
export async function logOAuthEvent(entry: {
  userId: string;
  connectorId: string;
  action: OAuthLogAction;
  status: "success" | "error";
  message?: string | null;
  accountEmail?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    const db = await admin();
    await db.from("google_oauth_logs").insert({
      user_id: entry.userId,
      connector_id: entry.connectorId,
      action: entry.action,
      status: entry.status,
      message: entry.message ? String(entry.message).slice(0, 500) : null,
      account_email: entry.accountEmail ?? null,
      meta: entry.meta ?? {},
    });
  } catch {
    // logging nunca deve quebrar o fluxo
  }
}

export async function listOAuthLogs(params: {
  userId: string;
  isAdmin: boolean;
  scopeUserId?: string | null;
  limit?: number;
}) {
  const db = await admin();
  let q = db
    .from("google_oauth_logs")
    .select("id, user_id, connector_id, action, status, message, account_email, created_at")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 200);
  if (!params.isAdmin) q = q.eq("user_id", params.userId);
  else if (params.scopeUserId) q = q.eq("user_id", params.scopeUserId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    user_id: string;
    connector_id: string;
    action: string;
    status: string;
    message: string | null;
    account_email: string | null;
    created_at: string;
  }>;
}

export async function listProfilesBasic() {
  const db = await admin();
  const { data } = await db.from("profiles").select("id, full_name");
  return (data ?? []) as Array<{ id: string; full_name: string | null }>;
}
