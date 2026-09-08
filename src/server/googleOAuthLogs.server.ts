// Server-only — leitura de logs de OAuth do Google (próprio do app, não App User Connector).
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (t: string) => any;
  };
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
