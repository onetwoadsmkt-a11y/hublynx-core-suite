// Server-only — OAuth 2.0 próprio do app para Google (Calendar, Drive, Gmail).
// Nunca importar em código de cliente.

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export const OAUTH_CALLBACK_PATH = "/api/public/google/oauth/callback";

export const GOOGLE_SCOPE_CATALOG = [
  {
    key: "calendar.readonly",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    label: "Calendar — leitura",
    service: "calendar",
  },
  {
    key: "calendar.events",
    scope: "https://www.googleapis.com/auth/calendar.events",
    label: "Calendar — escrita (eventos)",
    service: "calendar",
  },
  {
    key: "drive.file",
    scope: "https://www.googleapis.com/auth/drive.file",
    label: "Drive — arquivos do app",
    service: "drive",
  },
  {
    key: "gmail.readonly",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    label: "Gmail — leitura",
    service: "gmail",
  },
  {
    key: "gmail.send",
    scope: "https://www.googleapis.com/auth/gmail.send",
    label: "Gmail — envio",
    service: "gmail",
  },
] as const;

export const BASE_SCOPES = ["openid", "email", "profile"];

export type GoogleServiceKey = "calendar" | "drive" | "gmail";

export async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

export type GoogleOAuthConfig = {
  client_id: string | null;
  client_secret: string | null;
  enabled_scopes: string[];
  updated_at: string | null;
};

export async function readConfig(): Promise<GoogleOAuthConfig> {
  // Credenciais são backend-only: secrets do servidor têm prioridade sobre o banco.
  const envId = process.env['GOOGLE_OAUTH_CLIENT_ID'] ?? null;
  const envSecret = process.env['GOOGLE_OAUTH_CLIENT_SECRET'] ?? null;
  const c = await db();
  const { data } = await c
    .from("google_oauth_config")
    .select("client_id, client_secret, enabled_scopes, updated_at")
    .eq("id", 1)
    .maybeSingle();
  return {
    client_id: envId ?? data?.client_id ?? null,
    client_secret: envSecret ?? data?.client_secret ?? null,
    enabled_scopes: data?.enabled_scopes ?? [],
    updated_at: data?.updated_at ?? null,
  };
}

export async function writeConfig(input: {
  clientId: string;
  clientSecret?: string | null;
  enabledScopes: string[];
  updatedBy: string;
}) {
  const c = await db();
  const patch: Record<string, unknown> = {
    id: 1,
    client_id: input.clientId,
    enabled_scopes: input.enabledScopes,
    updated_at: new Date().toISOString(),
    updated_by: input.updatedBy,
  };
  if (input.clientSecret) patch["client_secret"] = input.clientSecret;
  const { error } = await c.from("google_oauth_config").upsert(patch, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

/** Traduz erros do Google em instruções acionáveis em português. */
export function explainGoogleError(raw: string | null | undefined): string {
  const t = (raw ?? "").toLowerCase();
  if (!t) return "Erro desconhecido na comunicação com o Google.";
  if (t.includes("redirect_uri_mismatch"))
    return "A Redirect URI usada não está cadastrada no cliente OAuth. Copie a Redirect URI desta tela e cole em Google Cloud Console → Credenciais → OAuth Client → URIs de redirecionamento autorizados.";
  if (t.includes("admin_policy_enforced"))
    return "A conta Google Workspace bloqueou o acesso. O administrador precisa liberar este Client ID no Admin Console → Segurança → Controles de API → Apps de terceiros.";
  if (t.includes("access_denied"))
    return "Acesso negado na tela de consentimento. Se o app está em modo Testing, adicione o e-mail como usuário de teste na tela de consentimento OAuth; caso contrário, aceite todas as permissões solicitadas.";
  if (t.includes("invalid_client") || t.includes("unauthorized_client"))
    return "Client ID ou Client Secret incorretos nas configurações. Revise as credenciais salvas.";
  if (t.includes("invalid_grant"))
    return "Autorização expirada ou revogada. Revogue o acesso em myaccount.google.com/permissions e conecte novamente.";
  if (t.includes("org_internal"))
    return "O cliente OAuth está restrito à organização. Publique o app ou use uma conta da mesma organização.";
  if (t.includes("invalid_scope"))
    return "Escopo inválido ou não habilitado. Ative as APIs correspondentes no Google Cloud Console.";
  return raw as string;
}

export async function logEvent(entry: {
  userId: string;
  connectorId: string;
  action: string;
  status: "success" | "error";
  message?: string | null;
  accountEmail?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    const c = await db();
    await c.from("google_oauth_logs").insert({
      user_id: entry.userId,
      connector_id: entry.connectorId,
      action: entry.action,
      status: entry.status,
      message: entry.message ? String(entry.message).slice(0, 800) : null,
      account_email: entry.accountEmail ?? null,
      meta: entry.meta ?? {},
    });
  } catch {
    // logging nunca quebra o fluxo
  }
}

export async function createState(input: {
  userId: string;
  scopes: string[];
  redirectUri: string;
}) {
  const c = await db();
  const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { error } = await c.from("oauth_states").insert({
    state,
    user_id: input.userId,
    scopes: input.scopes,
    redirect_uri: input.redirectUri,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return state;
}

export async function consumeState(state: string) {
  const c = await db();
  const { data } = await c
    .from("oauth_states")
    .select("state, user_id, scopes, redirect_uri, expires_at")
    .eq("state", state)
    .maybeSingle();
  if (!data) return null;
  await c.from("oauth_states").delete().eq("state", state);
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as {
    state: string;
    user_id: string;
    scopes: string[];
    redirect_uri: string;
    expires_at: string;
  };
}

export async function upsertConnection(row: {
  userId: string;
  googleEmail: string | null;
  scopes: string[];
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: string;
  status: string;
  lastError?: string | null;
}) {
  const c = await db();
  const patch: Record<string, unknown> = {
    user_id: row.userId,
    google_email: row.googleEmail,
    scopes: row.scopes,
    access_token: row.accessToken,
    expires_at: row.expiresAt,
    status: row.status,
    last_error: row.lastError ?? null,
    updated_at: new Date().toISOString(),
  };
  if (row.refreshToken) patch["refresh_token"] = row.refreshToken;
  const { error } = await c
    .from("google_connections")
    .upsert(patch, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export async function getConnection(userId: string) {
  const c = await db();
  const { data } = await c
    .from("google_connections")
    .select(
      "user_id, google_email, scopes, status, expires_at, last_error, access_token, refresh_token, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  return (data ?? null) as null | {
    user_id: string;
    google_email: string | null;
    scopes: string[];
    status: string;
    expires_at: string | null;
    last_error: string | null;
    access_token: string | null;
    refresh_token: string | null;
    updated_at: string;
  };
}

export async function markConnection(
  userId: string,
  patch: Record<string, unknown>,
) {
  const c = await db();
  await c
    .from("google_connections")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

export async function deleteConnection(userId: string) {
  const c = await db();
  await c.from("google_connections").delete().eq("user_id", userId);
}

/** Troca o authorization code por tokens. */
export async function exchangeCode(params: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      explainGoogleError(json?.error_description || json?.error || `HTTP ${res.status}`),
    );
  }
  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.email ?? null;
  } catch {
    return null;
  }
}

/** Renova o access_token usando o refresh_token. Marca revoked em invalid_grant. */
export async function refreshAccessToken(userId: string): Promise<string> {
  const conn = await getConnection(userId);
  if (!conn?.refresh_token) throw new Error("Conta Google não conectada.");
  const cfg = await readConfig();
  if (!cfg.client_id || !cfg.client_secret)
    throw new Error("Credenciais OAuth do Google não configuradas.");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = json?.error_description || json?.error || `HTTP ${res.status}`;
    const message = explainGoogleError(raw);
    await markConnection(userId, {
      status: String(raw).includes("invalid_grant") ? "revoked" : "error",
      last_error: message,
    });
    await logEvent({
      userId,
      connectorId: "google",
      action: "refresh",
      status: "error",
      message,
    });
    throw new Error(message);
  }
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  await markConnection(userId, {
    access_token: json.access_token,
    expires_at: expiresAt,
    status: "connected",
    last_error: null,
  });
  return json.access_token as string;
}

/** Access token válido (renova se faltarem menos de 5 minutos). */
export async function getValidAccessToken(userId: string): Promise<string> {
  const conn = await getConnection(userId);
  if (!conn || !conn.access_token) {
    throw new Error(
      "Conta Google não conectada. Vá em Configurações → Integrações e conecte sua conta.",
    );
  }
  if (conn.status === "revoked") {
    throw new Error("Acesso revogado pelo Google. Reconecte sua conta em Configurações.");
  }
  const exp = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  if (exp - Date.now() < 5 * 60_000) return refreshAccessToken(userId);
  return conn.access_token;
}

/**
 * Única porta de saída para as APIs do Google.
 * `path` deve ser uma URL absoluta de googleapis.com ou um caminho iniciado por "/".
 */
export async function googleFetch(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getValidAccessToken(userId);
  const url = path.startsWith("http") ? path : `https://www.googleapis.com${path}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

/** Cabeçalhos autenticados para chamadas diretas às APIs do Google. */
export async function googleAuthHeaders(userId: string): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getValidAccessToken(userId)}` };
}

export async function revokeToken(token: string) {
  try {
    await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // best-effort
  }
}
