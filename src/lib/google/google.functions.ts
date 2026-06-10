import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const GOOGLE_GATEWAY_URL = "https://connector-gateway.lovable.dev";

export type GoogleService = "mail" | "drive" | "calendar" | "sheets";

const SERVICE_TO_ENV: Record<GoogleService, string> = {
  mail: "GOOGLE_MAIL_API_KEY",
  drive: "GOOGLE_DRIVE_API_KEY",
  calendar: "GOOGLE_CALENDAR_API_KEY",
  sheets: "GOOGLE_SHEETS_API_KEY",
};

const SERVICE_LABELS: Record<GoogleService, string> = {
  mail: "Gmail",
  drive: "Google Drive",
  calendar: "Google Calendar",
  sheets: "Google Sheets",
};

/**
 * Server-only helper: returns headers required to call the Lovable connector
 * gateway for a given Google service. Throws if secrets are missing.
 */
export function getGoogleGatewayHeaders(service: GoogleService): HeadersInit {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env[SERVICE_TO_ENV[service]];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY não configurado");
  if (!connKey) {
    throw new Error(
      `Connector ${SERVICE_LABELS[service]} não conectado (secret ${SERVICE_TO_ENV[service]} ausente).`,
    );
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
  };
}

/**
 * Returns which Google services are currently connected for the workspace.
 * Used by the UI to show connection status — does NOT expose any secret.
 */
export const getGoogleConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const services: Array<{ service: GoogleService; label: string; connected: boolean }> = (
      Object.keys(SERVICE_TO_ENV) as GoogleService[]
    ).map((service) => ({
      service,
      label: SERVICE_LABELS[service],
      connected: !!process.env[SERVICE_TO_ENV[service]],
    }));

    // Best-effort: tentar buscar o e-mail da conta conectada via Gmail
    let email: string | null = null;
    const mailKey = process.env.GOOGLE_MAIL_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (mailKey && lovableKey) {
      try {
        const res = await fetch(
          `${GOOGLE_GATEWAY_URL}/google_mail/gmail/v1/users/me/profile`,
          {
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": mailKey,
            },
          },
        );
        if (res.ok) {
          const profile = (await res.json()) as { emailAddress?: string };
          email = profile.emailAddress ?? null;
        }
      } catch {
        // silencioso — e-mail é informativo
      }
    }

    return {
      email,
      services,
      allConnected: services.every((s) => s.connected),
    };
  });
