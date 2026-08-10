import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GOOGLE_GATEWAY_URL, getGoogleGatewayHeaders } from "./google.functions";
import type { GoogleService } from "./google.functions";

const schema = z.object({
  service: z.enum(["mail", "drive", "calendar", "sheets"]),
});

const PROBE: Record<GoogleService, string> = {
  mail: "/google_mail/gmail/v1/users/me/profile",
  drive: "/google_drive/drive/v3/about?fields=user",
  calendar: "/google_calendar/calendar/v3/users/me/calendarList?maxResults=1",
  sheets: "/google_drive/drive/v3/about?fields=user",
};

function describe(service: GoogleService, json: any): string | null {
  if (service === "mail") return json?.emailAddress ?? null;
  if (service === "calendar") return json?.items?.[0]?.summary ?? "Agenda acessível";
  return json?.user?.emailAddress ?? null;
}

/**
 * Testa a conexão de um serviço Google chamando um endpoint leve via gateway.
 * Nunca expõe segredos — retorna apenas status e mensagem.
 */
export const testGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const service = data.service as GoogleService;
    let headers: HeadersInit;
    try {
      headers = getGoogleGatewayHeaders(service === "sheets" ? "sheets" : service);
    } catch (e) {
      return { ok: false as const, service, message: (e as Error).message };
    }

    try {
      const res = await fetch(`${GOOGLE_GATEWAY_URL}${PROBE[service]}`, { headers });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false as const,
          service,
          message: `Erro ${res.status}: ${json?.error?.message ?? "falha na chamada ao Google"}`,
        };
      }
      const detail = describe(service, json);
      return {
        ok: true as const,
        service,
        message: detail ? `Conexão OK — ${detail}` : "Conexão OK",
      };
    } catch (e) {
      return { ok: false as const, service, message: (e as Error).message };
    }
  });
