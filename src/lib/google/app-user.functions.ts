import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const GOOGLE_APP_USER_SERVICES = [
  { connectorId: "google_mail", label: "Gmail" },
  { connectorId: "google_calendar", label: "Google Calendar" },
  { connectorId: "google_drive", label: "Google Drive" },
  
] as const;

export type GoogleConnectorId = (typeof GOOGLE_APP_USER_SERVICES)[number]["connectorId"];

const connectorSchema = z.object({
  connectorId: z.enum(["google_mail", "google_calendar", "google_drive"]),
});

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

const BASE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const SCOPES: Record<GoogleConnectorId, string[]> = {
  google_mail: [
    ...BASE_SCOPES,
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
  ],
  google_calendar: [...BASE_SCOPES, "https://www.googleapis.com/auth/calendar"],
  google_drive: [...BASE_SCOPES, "https://www.googleapis.com/auth/drive"],
};

const CLIENT_KEY_ENV: Record<GoogleConnectorId, string> = {
  google_mail: "GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY",
  google_calendar: "GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY",
  google_drive: "GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY",
};

/** Fallback: um único cliente OAuth compartilhado pode atender os 4 serviços. */
const SHARED_CLIENT_KEY_ENV = "GOOGLE_APP_USER_CONNECTOR_CLIENT_API_KEY";

function resolveClientKey(connectorId: GoogleConnectorId): string | undefined {
  return process.env[CLIENT_KEY_ENV[connectorId]] || process.env[SHARED_CLIENT_KEY_ENV];
}

const PROBE: Record<GoogleConnectorId, string> = {
  google_mail: "/gmail/v1/users/me/profile",
  google_calendar: "/calendar/v3/users/me/calendarList?maxResults=1",
  google_drive: "/drive/v3/about?fields=user",
};

/** Status das conexões Google do usuário logado. Não expõe segredos. */
export const getMyGoogleConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listUserConnections } = await import("@/server/appUserConnections.server");
    let rows: Array<{ connector_id: string; account_email: string | null; updated_at: string }> = [];
    try {
      rows = await listUserConnections(context.userId);
    } catch {
      rows = [];
    }
    return GOOGLE_APP_USER_SERVICES.map((s) => {
      const row = rows.find((r) => r.connector_id === s.connectorId);
      return {
        connectorId: s.connectorId,
        label: s.label,
        clientConfigured: !!resolveClientKey(s.connectorId),
        connected: !!row,
        email: row?.account_email ?? null,
        updatedAt: row?.updated_at ?? null,
      };
    });
  });

function pickEmail(json: any): string | null {
  const candidates = [
    json?.emailAddress,
    json?.user?.emailAddress,
    json?.items?.[0]?.id,
    json?.items?.[0]?.summary,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes("@")) return c;
  }
  return null;
}

/** Inicia o consentimento OAuth do usuário para um serviço Google. */
export const startGoogleAppUserConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    connectorSchema.extend({ accountEmail: z.string().email().nullish() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const connectorId = data.connectorId as GoogleConnectorId;
    const clientAPIKey = resolveClientKey(connectorId);
    if (!clientAPIKey) {
      throw new Error(
        `Cliente OAuth do Google ainda não aprovado no workspace. Peça ao administrador para criar/aprovar o cliente (${CLIENT_KEY_ENV[connectorId]} ou ${SHARED_CLIENT_KEY_ENV}) e clique em "Verificar novamente".`,
      );
    }
    const request = getRequest();
    if (!request) throw new Error("OAuth precisa iniciar a partir de uma requisição do app.");
    const reqUrl = new URL(request.url);
    // Em preview o app roda atrás de um proxy local; usa o host público.
    const forwardedHost =
      reqUrl.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const origin = forwardedHost ? `https://${forwardedHost}` : reqUrl.origin;
    const returnUrl = new URL("/oauth/google/return", origin).toString();

    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    let existing: string | null = null;
    try {
      existing = await getConnectionKeyForUser(context.userId, connectorId);
    } catch {
      existing = null;
    }

    const { logOAuthEvent } = await import("@/server/appUserConnections.server");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: SCOPES[connectorId] },
    });

    // Sugere a conta informada pelo usuário na tela do Google (quando possível).
    let finalUrl = authorizationUrl;
    if (data.accountEmail) {
      try {
        const u = new URL(authorizationUrl);
        if (u.hostname.endsWith("google.com")) {
          u.searchParams.set("login_hint", data.accountEmail);
          finalUrl = u.toString();
        }
      } catch {
        // mantém a URL original
      }
    }

    await logOAuthEvent({
      userId: context.userId,
      connectorId,
      action: "connect_start",
      status: "success",
      message: "Consentimento OAuth iniciado",
      accountEmail: data.accountEmail ?? null,
    });
    return { authorizationUrl: finalUrl };
  });

/** Troca o código de retorno pela chave de conexão e persiste (criptografada). */
export const completeGoogleAppUserConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ code: z.string().min(1), expectedEmail: z.string().email().nullish() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode, callAsAppUser, disconnectAppUser } = await import(
      "@/integrations/lovable/appUserConnector"
    );
    const { saveConnectionKeyForUser, logOAuthEvent } = await import(
      "@/server/appUserConnections.server"
    );
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    const known = GOOGLE_APP_USER_SERVICES.some((s) => s.connectorId === connectorId);
    if (!known) throw new Error("Conector inesperado no retorno do OAuth");

    let email: string | null = null;
    try {
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey,
        connectorId,
        path: PROBE[connectorId as GoogleConnectorId],
      });
      if (res.ok) email = pickEmail(await res.json());
    } catch {
      email = null;
    }

    // A conta autorizada precisa ser a que o usuário informou.
    if (
      data.expectedEmail &&
      email &&
      email.toLowerCase() !== data.expectedEmail.toLowerCase()
    ) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey,
          connectorId,
        });
      } catch {
        // ignora falha ao desfazer no gateway
      }
      const message = `Você autorizou ${email}, mas a conta de integração configurada é ${data.expectedEmail}.`;
      await logOAuthEvent({
        userId: context.userId,
        connectorId,
        action: "connect_complete",
        status: "error",
        message,
        accountEmail: email,
      });
      throw new Error(message);
    }

    await saveConnectionKeyForUser(
      context.userId,
      connectorId,
      connectionAPIKey,
      email ?? data.expectedEmail ?? null,
    );
    await logOAuthEvent({
      userId: context.userId,
      connectorId,
      action: "connect_complete",
      status: "success",
      message: "Conta conectada com sucesso",
      accountEmail: email ?? data.expectedEmail ?? null,
    });
    return { ok: true, connectorId, email: email ?? data.expectedEmail ?? null };
  });



/** Testa a conexão do usuário chamando um endpoint leve do Google. */
export const testMyGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => connectorSchema.parse(d))
  .handler(async ({ data, context }) => {
    const connectorId = data.connectorId as GoogleConnectorId;
    const { getConnectionKeyForUser, setConnectionEmail, logOAuthEvent } = await import(
      "@/server/appUserConnections.server"
    );
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, connectorId);
    if (!connectionAPIKey) {
      await logOAuthEvent({
        userId: context.userId,
        connectorId,
        action: "test",
        status: "error",
        message: "Conta não conectada.",
      });
      return { ok: false as const, message: "Conta não conectada." };
    }
    try {
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey,
        connectorId,
        path: PROBE[connectorId],
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = `Erro ${res.status}: ${json?.error?.message ?? "falha na chamada ao Google"}`;
        await logOAuthEvent({
          userId: context.userId,
          connectorId,
          action: "test",
          status: "error",
          message,
        });
        return { ok: false as const, message };
      }
      const detail =
        json?.emailAddress ?? json?.user?.emailAddress ?? json?.items?.[0]?.summary ?? null;
      if (typeof detail === "string" && detail.includes("@")) {
        await setConnectionEmail(context.userId, connectorId, detail);
      }
      const okMessage = detail ? `Conexão OK — ${detail}` : "Conexão OK";
      await logOAuthEvent({
        userId: context.userId,
        connectorId,
        action: "test",
        status: "success",
        message: okMessage,
        accountEmail: typeof detail === "string" && detail.includes("@") ? detail : null,
      });
      return { ok: true as const, message: okMessage };
    } catch (e) {
      await logOAuthEvent({
        userId: context.userId,
        connectorId,
        action: "test",
        status: "error",
        message: (e as Error).message,
      });
      return { ok: false as const, message: (e as Error).message };
    }
  });

/** Desconecta a conta Google do usuário para um serviço. */
export const disconnectMyGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => connectorSchema.parse(d))
  .handler(async ({ data, context }) => {
    const connectorId = data.connectorId as GoogleConnectorId;
    const { getConnectionKeyForUser, deleteConnectionForUser, logOAuthEvent } = await import(
      "@/server/appUserConnections.server"
    );
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, connectorId);
    if (connectionAPIKey) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey,
          connectorId,
        });
      } catch {
        // segue removendo localmente
      }
    }
    await deleteConnectionForUser(context.userId, connectorId);
    await logOAuthEvent({
      userId: context.userId,
      connectorId,
      action: "disconnect",
      status: "success",
      message: "Conta desconectada",
    });
    return { ok: true };
  });

/** Histórico de eventos OAuth do usuário (admins veem de todos). */
export const listGoogleOAuthLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid().nullish() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listOAuthLogs, listProfilesBasic } = await import(
      "@/server/appUserConnections.server"
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
