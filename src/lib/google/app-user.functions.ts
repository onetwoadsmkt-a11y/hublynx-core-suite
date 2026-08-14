import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const GOOGLE_APP_USER_SERVICES = [
  { connectorId: "google_mail", label: "Gmail" },
  { connectorId: "google_calendar", label: "Google Calendar" },
  { connectorId: "google_drive", label: "Google Drive" },
  { connectorId: "google_sheets", label: "Google Sheets" },
] as const;

export type GoogleConnectorId = (typeof GOOGLE_APP_USER_SERVICES)[number]["connectorId"];

const connectorSchema = z.object({
  connectorId: z.enum(["google_mail", "google_calendar", "google_drive", "google_sheets"]),
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
  google_sheets: [...BASE_SCOPES, "https://www.googleapis.com/auth/spreadsheets"],
};

const CLIENT_KEY_ENV: Record<GoogleConnectorId, string> = {
  google_mail: "GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY",
  google_calendar: "GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY",
  google_drive: "GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY",
  google_sheets: "GOOGLE_SHEETS_APP_USER_CONNECTOR_CLIENT_API_KEY",
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
  google_sheets: "/drive/v3/about?fields=user",
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

/** Inicia o consentimento OAuth do usuário para um serviço Google. */
export const startGoogleAppUserConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => connectorSchema.parse(d))
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
    const returnUrl = new URL("/oauth/google/return", request.url).toString();

    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    let existing: string | null = null;
    try {
      existing = await getConnectionKeyForUser(context.userId, connectorId);
    } catch {
      existing = null;
    }

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: SCOPES[connectorId] },
    });
    return { authorizationUrl };
  });

/** Troca o código de retorno pela chave de conexão e persiste (criptografada). */
export const completeGoogleAppUserConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode, callAsAppUser } = await import(
      "@/integrations/lovable/appUserConnector"
    );
    const { saveConnectionKeyForUser } = await import("@/server/appUserConnections.server");
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
      if (res.ok) {
        const j: any = await res.json();
        email = j?.emailAddress ?? j?.user?.emailAddress ?? null;
      }
    } catch {
      email = null;
    }

    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey, email);
    return { ok: true, connectorId };
  });

/** Testa a conexão do usuário chamando um endpoint leve do Google. */
export const testMyGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => connectorSchema.parse(d))
  .handler(async ({ data, context }) => {
    const connectorId = data.connectorId as GoogleConnectorId;
    const { getConnectionKeyForUser, setConnectionEmail } = await import(
      "@/server/appUserConnections.server"
    );
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, connectorId);
    if (!connectionAPIKey) {
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
        return {
          ok: false as const,
          message: `Erro ${res.status}: ${json?.error?.message ?? "falha na chamada ao Google"}`,
        };
      }
      const detail =
        json?.emailAddress ?? json?.user?.emailAddress ?? json?.items?.[0]?.summary ?? null;
      if (typeof detail === "string" && detail.includes("@")) {
        await setConnectionEmail(context.userId, connectorId, detail);
      }
      return { ok: true as const, message: detail ? `Conexão OK — ${detail}` : "Conexão OK" };
    } catch (e) {
      return { ok: false as const, message: (e as Error).message };
    }
  });

/** Desconecta a conta Google do usuário para um serviço. */
export const disconnectMyGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => connectorSchema.parse(d))
  .handler(async ({ data, context }) => {
    const connectorId = data.connectorId as GoogleConnectorId;
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
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
    return { ok: true };
  });
