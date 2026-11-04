import { GOOGLE_API_BASE, googleHeaders } from "./google.functions";

const EVENTS_URL = `${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events`;

export type LeadEventInput = {
  title: string;
  kind: string;
  description?: string | null;
  startISO: string;
  durationMinutes: number;
  /** undefined = não mexe nos convidados (edição); [] = sem convidados. */
  attendees?: string[];
  /** cria um link do Meet (só quando ainda não existe — senão o link mudaria a cada edição) */
  withMeet: boolean;
  eventId?: string | null;
};

export type LeadEventResult = {
  eventId: string | null;
  meetLink: string | null;
  htmlLink: string | null;
  error: string | null;
  /** a pessoa não tem Google conectado (não é falha: o agendamento fica só no Core) */
  notConnected?: boolean;
};

const NOT_CONNECTED = /não conectad|not connected|credenciais oauth/i;

/**
 * Cria ou atualiza (idempotente por eventId) um evento no Google Calendar
 * para um agendamento de lead. Nunca lança: retorna `error` quando falha,
 * para que o agendamento local continue sendo salvo.
 */
export async function upsertLeadCalendarEvent(userId: string, input: LeadEventInput): Promise<LeadEventResult> {
  let headers: Record<string, string>;
  try {
    headers = await googleHeaders(userId);
  } catch (e: any) {
    const msg = String(e?.message ?? "erro");
    return { eventId: null, meetLink: null, htmlLink: null, error: msg, notConnected: NOT_CONNECTED.test(msg) };
  }
  try {
    const start = new Date(input.startISO);
    const end = new Date(start.getTime() + input.durationMinutes * 60_000);

    const body: Record<string, unknown> = {
      summary: input.title,
      description: input.description ?? undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };
    // Na edição os convidados ficam como estão (antes o PATCH mandava [] e o lead recebia cancelamento).
    if (input.attendees !== undefined) {
      body.attendees = input.attendees.filter(Boolean).map((email) => ({ email }));
    }
    const conference = {
      createRequest: {
        requestId: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
    if (input.withMeet) body.conferenceData = conference;

    const send = (eventId: string | null | undefined, payload: Record<string, unknown>) =>
      fetch(
        eventId
          ? `${EVENTS_URL}/${eventId}?conferenceDataVersion=1&sendUpdates=all`
          : `${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=all`,
        {
          method: eventId ? "PATCH" : "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

    let res = await send(input.eventId, body);
    // Evento apagado direto no Google: cria de novo (senão o agendamento nunca mais sincronizava).
    if (input.eventId && (res.status === 404 || res.status === 410)) {
      const fresh = { ...body };
      if (fresh.attendees === undefined) delete fresh.attendees;
      if (input.withMeet || fresh.conferenceData) fresh.conferenceData = conference;
      res = await send(null, fresh);
    }
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

/** Prefixo usado no Google para itens concluídos no Core. */
export const DONE_PREFIX = "✓ ";

/** Título no Google: concluído recebe "✓ " na frente; reaberto volta ao normal. */
export function googleSummary(title: string, done: boolean) {
  const clean = title.startsWith(DONE_PREFIX) ? title.slice(DONE_PREFIX.length) : title;
  return done ? `${DONE_PREFIX}${clean}` : clean;
}

/**
 * Marca (ou desmarca) um evento como concluído no Google: "✓ " no título e cor grafite.
 * Sem convidar ninguém de novo. Nunca lança.
 */
export async function markCalendarEventDone(userId: string, eventId: string, title: string, done: boolean) {
  try {
    const headers = await googleHeaders(userId);
    await fetch(`${EVENTS_URL}/${eventId}?sendUpdates=none`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      // colorId 8 = grafite no Google Agenda; "" volta para a cor da agenda.
      body: JSON.stringify({ summary: googleSummary(title, done), colorId: done ? "8" : null }),
    });
  } catch {
    // best-effort: o Core já está atualizado
  }
}
