import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authorizeAppUserOAuth, callAsAppUser } from "@/integrations/lovable/appUserConnector";

export const GOOGLE_GATEWAY_URL = "https://connector-gateway.lovable.dev";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/spreadsheets",
];

export const startGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { targetOrigin: string }) => data)
  .handler(async ({ data, context }) => {
    const clientId = process.env.GOOGLE_APP_USER_CONNECTOR_CLIENT_ID;
    if (!clientId) {
      throw new Error("GOOGLE_APP_USER_CONNECTOR_CLIENT_ID não configurado. Configure nos Secrets.");
    }
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GOOGLE_GATEWAY_URL,
      connectorId: "google",
      appUserId: context.userId,
      connectorClientId: clientId,
      returnUrl: `${data.targetOrigin}/configuracoes/integracoes`,
      responseMode: "web_message",
      webMessageTargetOrigin: data.targetOrigin,
      credentialsConfiguration: { scopes: GOOGLE_SCOPES },
    });
    return { authorizationUrl };
  });

export const saveGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { connectionAPIKey: string }) => data)
  .handler(async ({ data, context }) => {
    if (!data.connectionAPIKey?.startsWith("lovack_")) {
      throw new Error("connectionAPIKey inválida");
    }
    // Buscar email do usuário Google
    let email: string | null = null;
    try {
      const res = await callAsAppUser({
        gatewayBaseUrl: GOOGLE_GATEWAY_URL,
        connectionAPIKey: data.connectionAPIKey,
        connectorId: "google_mail",
        path: "/gmail/v1/users/me/profile",
      });
      if (res.ok) {
        const profile = await res.json();
        email = profile.emailAddress ?? null;
      }
    } catch {
      // ignore — email é opcional
    }

    const { error } = await context.supabase
      .from("user_google_connections")
      .upsert(
        {
          user_id: context.userId,
          connection_api_key: data.connectionAPIKey,
          email,
          scopes: GOOGLE_SCOPES,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, email };
  });

export const getGoogleConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_google_connections")
      .select("id, email, scopes, connected_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { connection: data };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("user_google_connections")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
