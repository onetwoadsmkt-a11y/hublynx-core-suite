import { GOOGLE_API_BASE, googleHeaders } from "./google.functions";

const EVENTS_URL = `${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events`;

export type LeadEventInput = {
  title: string;
  kind: string;
  description?: string | null;
  startISO: string;
  durationMinutes: number;
  attendees?: string[];
  withMeet: boolean;
  eventId?: string | null;
};

export type LeadEventResult = {
  eventId: string | null;
  meetLink: string | null;
  htmlLink: string | null;
  error: string | null;
};

/**
 * Cria ou atualiza (idempotente por eventId) um evento no Google Calendar
 * para um agendamento de lead. Nunca lança: retorna `error` quando falha,
 * para que o agendamento local continue sendo salvo.
 */
export async function upsertLeadCalendarEvent(userId: string, input: LeadEventInput): Promise<LeadEventResult> {
  try {
    const headers = await googleHeaders(userId);
    const start = new Date(input.startISO);
    const end = new Date(start.getTime() + input.durationMinutes * 60_000);

    const body: Record<string, unknown> = {
      summary: input.title,
      description: input.description ?? undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: (input.attendees ?? []).filter(Boolean).map((email) => ({ email })),
    };
    if (input.withMeet) {
      body["conferenceData"] = {
        createRequest: {
          requestId: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const url = input.eventId
      ? `${EVENTS_URL}/${input.eventId}?conferenceDataVersion=1&sendUpdates=all`
      : `${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=all`;

    const res = await fetch(url, {
      method: input.eventId ? "PATCH" : "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      console.error(`Google Calendar falhou [${res.status}]:`, JSON.stringify(json));
      return {
        eventId: null,
        meetLink: null,
        htmlLink: null,
        error: json?.error?.message || `HTTP ${res.status}`,
      };
    }
    const meetLink: string | null =
      json?.hangoutLink ??
      json?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri ??
      null;
    return {
      eventId: (json?.id as string) ?? null,
      meetLink,
      htmlLink: (json?.htmlLink as string) ?? null,
      error: null,
    };
  } catch (e: any) {
    return { eventId: null, meetLink: null, htmlLink: null, error: e?.message ?? "erro" };
  }
}

export async function deleteLeadCalendarEvent(userId: string, eventId: string): Promise<void> {
  try {
    const headers = await googleHeaders(userId);
    await fetch(`${EVENTS_URL}/${eventId}?sendUpdates=all`, { method: "DELETE", headers });
  } catch {
    // best-effort
  }
}
