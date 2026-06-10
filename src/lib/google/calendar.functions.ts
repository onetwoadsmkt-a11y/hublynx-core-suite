import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GOOGLE_GATEWAY_URL, getGoogleGatewayHeaders } from "./google.functions";

const scheduleSchema = z.object({
  taskId: z.string().uuid(),
  summary: z.string().min(1).max(500),
  description: z.string().max(8000).optional(),
  startAt: z.string().min(1), // ISO
  durationMinutes: z.number().int().min(10).max(480),
  attendees: z.array(z.string().email()).max(50).default([]),
  sendInvites: z.boolean().default(true),
});

const instantSchema = z.object({
  taskId: z.string().uuid(),
  summary: z.string().min(1).max(500),
  durationMinutes: z.number().int().min(10).max(240).default(30),
});

async function createCalendarEvent({
  summary,
  description,
  startISO,
  endISO,
  attendees,
  sendUpdates,
}: {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  attendees: string[];
  sendUpdates: "all" | "none";
}) {
  const headers = getGoogleGatewayHeaders("calendar");
  const requestId = `meet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const body = {
    summary,
    description,
    start: { dateTime: startISO },
    end: { dateTime: endISO },
    attendees: attendees.map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  const url = `${GOOGLE_GATEWAY_URL}/google_calendar/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${sendUpdates}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}) as any);
  if (!res.ok) {
    throw new Error(
      `Falha ao criar evento (${res.status}): ${json?.error?.message || JSON.stringify(json)}`,
    );
  }
  const meetLink: string | null =
    json?.hangoutLink ??
    json?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri ??
    null;
  return { eventId: json?.id as string, meetLink, htmlLink: json?.htmlLink as string };
}

async function recordMeeting(
  supabase: any,
  ownerId: string,
  actorId: string,
  args: {
    taskId: string;
    summary: string;
    startISO: string;
    attendees: string[];
    eventId: string | null;
    meetLink: string | null;
  },
) {
  const { error } = await supabase.from("task_communications").insert({
    task_id: args.taskId,
    owner_id: ownerId,
    actor_id: actorId,
    kind: "meeting",
    subject: args.summary,
    recipients: args.attendees,
    provider_id: args.eventId,
    meet_link: args.meetLink,
    start_at: args.startISO,
    metadata: {},
  });
  if (error) throw new Error(error.message);
}

export const scheduleMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => scheduleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("tasks")
      .select("id, owner_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error || !task) throw new Error("Tarefa não encontrada");

    const start = new Date(data.startAt);
    const end = new Date(start.getTime() + data.durationMinutes * 60_000);

    const evt = await createCalendarEvent({
      summary: data.summary,
      description: data.description,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      attendees: data.attendees,
      sendUpdates: data.sendInvites ? "all" : "none",
    });

    await recordMeeting(supabase, task.owner_id, userId, {
      taskId: data.taskId,
      summary: data.summary,
      startISO: start.toISOString(),
      attendees: data.attendees,
      eventId: evt.eventId,
      meetLink: evt.meetLink,
    });

    return { ok: true as const, ...evt, startAt: start.toISOString() };
  });

export const createInstantMeet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => instantSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("tasks")
      .select("id, owner_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error || !task) throw new Error("Tarefa não encontrada");

    const start = new Date();
    const end = new Date(start.getTime() + data.durationMinutes * 60_000);

    const evt = await createCalendarEvent({
      summary: data.summary,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      attendees: [],
      sendUpdates: "none",
    });

    await recordMeeting(supabase, task.owner_id, userId, {
      taskId: data.taskId,
      summary: data.summary,
      startISO: start.toISOString(),
      attendees: [],
      eventId: evt.eventId,
      meetLink: evt.meetLink,
    });

    return { ok: true as const, ...evt, startAt: start.toISOString() };
  });
