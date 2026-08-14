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
