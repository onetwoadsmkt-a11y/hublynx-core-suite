import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const scopeKeys = [
  "calendar.readonly",
  "calendar.events",
  "drive.file",
  "gmail.readonly",
  "gmail.send",
] as const;

async function assertAdmin(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Apenas administradores podem alterar a integração Google.");
}

/** Config OAuth para a tela de admin. Nunca devolve o client_secret real. */
export const getGoogleOAuthConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readConfig, GOOGLE_SCOPE_CATALOG } = await import("@/server/googleOAuth.server");
    const { resolveRedirectUri } = await import("@/server/googleOrigin.server");
    await assertAdmin(context);
    const cfg = await readConfig();
    const request = getRequest();
    return {
      clientId: cfg.client_id ?? "",
      hasSecret: !!cfg.client_secret,
      enabledScopes: cfg.enabled_scopes,
      updatedAt: cfg.updated_at,
      redirectUri: request ? resolveRedirectUri(request) : "",
      catalog: GOOGLE_SCOPE_CATALOG.map((s) => ({
        key: s.key,
        label: s.label,
        service: s.service,
      })),
    };
  });

export const saveGoogleOAuthConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().trim().min(10).max(300),
        clientSecret: z.string().trim().max(300).nullish(),
        enabledScopes: z.array(z.enum(scopeKeys)).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { writeConfig, logEvent } = await import("@/server/googleOAuth.server");
    await assertAdmin(context);
    if (!data.clientId.endsWith(".apps.googleusercontent.com")) {
      throw new Error("Client ID inválido: deve terminar em .apps.googleusercontent.com");
    }
    await writeConfig({
      clientId: data.clientId,
      clientSecret: data.clientSecret || null,
      enabledScopes: [...data.enabledScopes],
      updatedBy: context.userId,
    });
    await logEvent({
      userId: context.userId,
      connectorId: "google",
      action: "config_save",
      status: "success",
      message: "Credenciais OAuth atualizadas",
    });
    return { ok: true as const };
  });

/** Valida formato e aceitação das credenciais pelo Google. */
export const testGoogleCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readConfig, explainGoogleError, GOOGLE_TOKEN_URL } = await import(
      "@/server/googleOAuth.server"
    );
    const { resolveRedirectUri } = await import("@/server/googleOrigin.server");
    await assertAdmin(context);
    const cfg = await readConfig();
    if (!cfg.client_id) return { ok: false as const, message: "Client ID não configurado." };
    if (!cfg.client_id.endsWith(".apps.googleusercontent.com"))
      return {
        ok: false as const,
        message: "Client ID inválido: deve terminar em .apps.googleusercontent.com",
      };
    if (!cfg.client_secret)
      return { ok: false as const, message: "Client Secret não configurado." };

    const request = getRequest();
    const redirectUri = request ? resolveRedirectUri(request) : "";
    // Um code propositalmente inválido: o Google só responde "invalid_grant"
    // quando o par client_id/secret é aceito.
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: "hublynx-credential-probe",
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    const err = String(json?.error ?? "");
    if (err === "invalid_grant") {
      return { ok: true as const, message: "Credenciais aceitas pelo Google." };
    }
    return {
      ok: false as const,
      message: explainGoogleError(json?.error_description || err || `HTTP ${res.status}`),
    };
  });

/** Gera a URL de consentimento (o cliente abre em pop-up). */
export const startGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ scopes: z.array(z.enum(scopeKeys)).min(1).max(10) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { readConfig, createState, logEvent, GOOGLE_AUTH_URL, GOOGLE_SCOPE_CATALOG, BASE_SCOPES } =
      await import("@/server/googleOAuth.server");
    const { resolveRedirectUri } = await import("@/server/googleOrigin.server");
    const cfg = await readConfig();
    if (!cfg.client_id) throw new Error("Client ID do Google não configurado pelo administrador.");
    const request = getRequest();
    if (!request) throw new Error("OAuth precisa iniciar a partir de uma requisição do app.");
    const redirectUri = resolveRedirectUri(request);

    const scopeUrls = GOOGLE_SCOPE_CATALOG.filter((s) =>
      (data.scopes as string[]).includes(s.key),
    ).map((s) => s.scope);
    const state = await createState({
      userId: context.userId,
      scopes: [...data.scopes],
      redirectUri,
    });

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", cfg.client_id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", [...BASE_SCOPES, ...scopeUrls].join(" "));

    await logEvent({
      userId: context.userId,
      connectorId: "google",
      action: "connect_start",
      status: "success",
      message: `Consentimento iniciado — redirect_uri: ${redirectUri}`,
      meta: { redirect_uri: redirectUri, scopes: data.scopes },
    });
    return { authorizationUrl: url.toString(), redirectUri };
  });

/** Status da conexão do usuário logado (sem tokens). */
export const getMyGoogleConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnection, readConfig, GOOGLE_SCOPE_CATALOG } = await import(
      "@/server/googleOAuth.server"
    );
    const cfg = await readConfig();
    const conn = await getConnection(context.userId);
    const granted = conn?.scopes ?? [];
    return {
      configured: !!cfg.client_id && !!cfg.client_secret,
      enabledScopes: cfg.enabled_scopes,
      connection: conn
        ? {
            email: conn.google_email,
            scopes: granted,
            status: conn.status,
            expiresAt: conn.expires_at,
            lastError: conn.last_error,
            updatedAt: conn.updated_at,
          }
        : null,
      catalog: GOOGLE_SCOPE_CATALOG.map((s) => ({
        key: s.key,
        label: s.label,
        service: s.service,
      })),
    };
  });

/** Desconecta: revoga no Google e apaga a linha. */
export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnection, revokeToken, deleteConnection, logEvent } = await import(
      "@/server/googleOAuth.server"
    );
    const conn = await getConnection(context.userId);
    if (conn?.refresh_token) await revokeToken(conn.refresh_token);
    else if (conn?.access_token) await revokeToken(conn.access_token);
    await deleteConnection(context.userId);
    await logEvent({
      userId: context.userId,
      connectorId: "google",
      action: "disconnect",
      status: "success",
      message: "Conta desconectada",
    });
    return { ok: true as const };
  });

/** Testa a conexão chamando um endpoint leve de cada serviço concedido. */
export const testMyGoogleServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { googleFetch, getConnection, explainGoogleError, logEvent } = await import(
      "@/server/googleOAuth.server"
    );
    const conn = await getConnection(context.userId);
    if (!conn) return [{ service: "google", ok: false, message: "Conta não conectada." }];
    const probes: Array<{ service: string; path: string; scope: string }> = [
      {
        service: "calendar",
        path: "/calendar/v3/users/me/calendarList?maxResults=1",
        scope: "calendar",
      },
      { service: "drive", path: "/drive/v3/about?fields=user", scope: "drive" },
      { service: "gmail", path: "/gmail/v1/users/me/profile", scope: "gmail" },
    ];
    const results: Array<{ service: string; ok: boolean; message: string }> = [];
    for (const p of probes) {
      if (!conn.scopes.some((s) => s.startsWith(p.scope))) continue;
      try {
        const res = await googleFetch(context.userId, p.path);
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) {
          results.push({
            service: p.service,
            ok: false,
            message: explainGoogleError(json?.error?.message || `HTTP ${res.status}`),
          });
        } else {
          results.push({ service: p.service, ok: true, message: "Conexão OK" });
        }
      } catch (e) {
        results.push({ service: p.service, ok: false, message: (e as Error).message });
      }
    }
    await logEvent({
      userId: context.userId,
      connectorId: "google",
      action: "test",
      status: results.every((r) => r.ok) ? "success" : "error",
      message: results.map((r) => `${r.service}: ${r.message}`).join(" | "),
    });
    return results;
  });

/** Diagnóstico: redirect_uri exata, client_id em uso e último erro do Google. */
export const getGoogleDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readConfig, getConnection } = await import("@/server/googleOAuth.server");
    const { resolveRedirectUri, resolveOrigin } = await import("@/server/googleOrigin.server");
    const { listOAuthLogs } = await import("@/server/googleOAuthLogs.server");
    const cfg = await readConfig();
    const conn = await getConnection(context.userId);
    const request = getRequest();
    const logs = await listOAuthLogs({ userId: context.userId, isAdmin: false, limit: 15 });
    return {
      redirectUri: request ? resolveRedirectUri(request) : "",
      origin: request ? resolveOrigin(request) : "",
      clientId: cfg.client_id ?? null,
      hasSecret: !!cfg.client_secret,
      enabledScopes: cfg.enabled_scopes,
      connectionStatus: conn?.status ?? "não conectado",
      grantedScopes: conn?.scopes ?? [],
      googleEmail: conn?.google_email ?? null,
      expiresAt: conn?.expires_at ?? null,
      lastError: conn?.last_error ?? null,
      recentEvents: logs.map((l) => ({
        at: l.created_at,
        action: l.action,
        status: l.status,
        message: l.message,
      })),
    };
  });

/** Histórico de eventos OAuth (admins veem de todos). */
export const listGoogleOAuthLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid().nullish() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listOAuthLogs, listProfilesBasic } = await import(
      "@/server/googleOAuthLogs.server"
    );
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleRow;
    const logs = await listOAuthLogs({
      userId: context.userId,
      isAdmin,
      scopeUserId: data?.userId ?? null,
    });
    const users = isAdmin ? await listProfilesBasic() : [];
    return { isAdmin, logs, users };
  });
