import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GOOGLE_API_BASE, googleHeaders } from "./google.functions";

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
  const headers = await googleHeaders(userId);
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
  const url = `${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${sendUpdates}`;
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

const syncTaskSchema = z.object({
  taskId: z.string().uuid(),
  durationMinutes: z.number().int().min(10).max(480).default(60),
  withMeet: z.boolean().default(false),
});

/**
 * Sincroniza uma tarefa com Google Calendar criando um evento no calendário
 * primário. Idempotente por tarefa: se já existe um task_communications de
 * sincronização para a tarefa, atualiza o evento ao invés de criar outro.
 */
export const syncTaskToCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => syncTaskSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("tasks")
      .select("id, owner_id, title, description, due_date, briefing")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error || !task) throw new Error("Tarefa não encontrada");
    if (!task.due_date) return { ok: false as const, reason: "no_due_date" };

    const type = (task.briefing as any)?.type ?? "tarefa";
    const wantsMeet = data.withMeet || type === "reuniao";

    const start = new Date(task.due_date as string);
    const end = new Date(start.getTime() + data.durationMinutes * 60_000);

    const headers = await googleHeaders(userId);
    const body: any = {
      summary: task.title,
      description: (task.description as string | null) ?? undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };
    if (wantsMeet) {
      body.conferenceData = {
        createRequest: {
          requestId: `task-${task.id}-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    // Verifica se já existe evento sincronizado
    const { data: existing } = await supabase
      .from("task_communications")
      .select("id, provider_id")
      .eq("task_id", task.id)
      .eq("kind", "meeting")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let res: Response;
    if (existing?.provider_id) {
      res = await fetch(
        `${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events/${existing.provider_id}?conferenceDataVersion=1`,
        { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
    } else {
      res = await fetch(
        `${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events?conferenceDataVersion=1`,
        { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
    }
    const json = await res.json().catch(() => ({}) as any);
    if (!res.ok) {
      throw new Error(`Falha ao sincronizar (${res.status}): ${json?.error?.message || JSON.stringify(json)}`);
    }
    const eventId = json?.id as string;
    const meetLink: string | null =
      json?.hangoutLink ??
      json?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri ??
      null;

    if (existing?.id) {
      await supabase
        .from("task_communications")
        .update({ subject: task.title, start_at: start.toISOString(), meet_link: meetLink, provider_id: eventId })
        .eq("id", existing.id);
    } else {
      await recordMeeting(supabase, task.owner_id as string, userId, {
        taskId: task.id as string,
        summary: task.title as string,
        startISO: start.toISOString(),
        attendees: [],
        eventId,
        meetLink,
      });
    }

    return { ok: true as const, eventId, meetLink, htmlLink: json?.htmlLink ?? null };
  });

/**
 * Backfill: sincroniza com Google Calendar todas as tarefas do usuário
 * com data definida que ainda não possuem evento espelhado.
 */
export const syncAllPendingTasksToCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("id, owner_id, title, description, due_date, briefing")
      .eq("owner_id", userId)
      .not("due_date", "is", null)
      .limit(500);
    if (error) throw new Error(error.message);

    const headers = await googleHeaders(userId);
    let created = 0, updated = 0, failed = 0;
    const errors: string[] = [];

    for (const task of tasks ?? []) {
      try {
        const type = (task.briefing as any)?.type ?? "tarefa";
        const wantsMeet = type === "reuniao";
        const start = new Date(task.due_date as string);
        const end = new Date(start.getTime() + 60 * 60_000);
        const body: any = {
          summary: task.title,
          description: (task.description as string | null) ?? undefined,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        };
        if (wantsMeet) {
          body.conferenceData = {
            createRequest: {
              requestId: `task-${task.id}-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          };
        }
        const { data: existing } = await supabase
          .from("task_communications")
          .select("id, provider_id")
          .eq("task_id", task.id as string)
          .eq("kind", "meeting")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let res: Response;
        if (existing?.provider_id) {
          res = await fetch(
            `${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events/${existing.provider_id}?conferenceDataVersion=1`,
            { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) },
          );
        } else {
          res = await fetch(
            `${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events?conferenceDataVersion=1`,
            { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) },
          );
        }
        const json = await res.json().catch(() => ({}) as any);
        if (!res.ok) {
          failed++;
          errors.push(`${task.title}: ${json?.error?.message || res.status}`);
          continue;
        }
        const eventId = json?.id as string;
        const meetLink: string | null =
          json?.hangoutLink ??
          json?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri ??
          null;

        if (existing?.id) {
          await supabase
            .from("task_communications")
            .update({ subject: task.title, start_at: start.toISOString(), meet_link: meetLink, provider_id: eventId })
            .eq("id", existing.id);
          updated++;
        } else {
          await recordMeeting(supabase, task.owner_id as string, userId, {
            taskId: task.id as string,
            summary: task.title as string,
            startISO: start.toISOString(),
            attendees: [],
            eventId,
            meetLink,
          });
          created++;
        }
      } catch (e: any) {
        failed++;
        errors.push(`${task.title}: ${e?.message ?? "erro"}`);
      }
    }

    return { ok: true as const, created, updated, failed, total: tasks?.length ?? 0, errors: errors.slice(0, 5) };
  });


