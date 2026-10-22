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
  userId,
  summary,
  description,
  startISO,
  endISO,
  attendees,
  sendUpdates,
}: {
  userId: string;
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
      userId: context.userId,
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
      userId: context.userId,
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

type SyncTask = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  briefing: any;
};
type MirrorRow = { id: string; task_id: string; provider_id: string | null; subject: string | null; start_at: string | null };

/**
 * Cria ou atualiza o evento do Google espelhado de uma tarefa e grava o vínculo
 * em task_communications (metadata.mirror = true). Não consulta nada além do necessário.
 */
async function pushTaskEvent(
  supabase: any,
  userId: string,
  headers: Record<string, string>,
  task: SyncTask,
  existing: MirrorRow | null,
  opts: { durationMinutes: number; withMeet?: boolean },
) {
  const type = task.briefing?.type ?? "tarefa";
  const wantsMeet = !!opts.withMeet || type === "reuniao";
  const start = new Date(task.due_date as string);
  const end = new Date(start.getTime() + opts.durationMinutes * 60_000);
  const body: any = {
    summary: task.title,
    description: task.description ?? undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
  if (wantsMeet && !existing?.provider_id) {
    body.conferenceData = {
      createRequest: { requestId: `task-${task.id}-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } },
    };
  }
  const url = existing?.provider_id
    ? `${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events/${existing.provider_id}?conferenceDataVersion=1`
    : `${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events?conferenceDataVersion=1`;
  const res = await fetch(url, {
    method: existing?.provider_id ? "PATCH" : "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}) as any);
  if (!res.ok) throw new Error(`Falha ao sincronizar (${res.status}): ${json?.error?.message || JSON.stringify(json)}`);
  const eventId = json?.id as string;
  const meetLink: string | null =
    json?.hangoutLink ?? json?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri ?? null;

  if (existing?.id) {
    await supabase
      .from("task_communications")
      .update({ subject: task.title, start_at: start.toISOString(), meet_link: meetLink, provider_id: eventId, metadata: { mirror: true } })
      .eq("id", existing.id);
  } else {
    const { error } = await supabase.from("task_communications").insert({
      task_id: task.id,
      owner_id: task.owner_id,
      actor_id: userId,
      kind: "meeting",
      subject: task.title,
      recipients: [],
      provider_id: eventId,
      meet_link: meetLink,
      start_at: start.toISOString(),
      metadata: { mirror: true },
    });
    if (error) throw new Error(error.message);
  }
  return { eventId, meetLink, htmlLink: (json?.htmlLink as string | undefined) ?? null, created: !existing?.id };
}

/** Já está igual no Google? (mesmo título e mesmo horário) */
function mirrorUpToDate(task: SyncTask, m: MirrorRow | null | undefined) {
  if (!m?.provider_id || !m.start_at || !task.due_date) return false;
  return m.subject === task.title && new Date(m.start_at).getTime() === new Date(task.due_date).getTime();
}

async function latestMirrors(supabase: any, taskIds: string[]): Promise<Map<string, MirrorRow>> {
  const map = new Map<string, MirrorRow>();
  for (let i = 0; i < taskIds.length; i += 200) {
    const { data } = await supabase
      .from("task_communications")
      .select("id, task_id, provider_id, subject, start_at, created_at")
      .in("task_id", taskIds.slice(i, i + 200))
      .eq("kind", "meeting")
      .order("created_at", { ascending: false });
    for (const r of (data ?? []) as MirrorRow[]) if (!map.has(r.task_id)) map.set(r.task_id, r);
  }
  return map;
}

/** Executa em paralelo com limite, para não demorar nem estourar a cota do Google. */
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Sincroniza uma tarefa com Google Calendar criando um evento no calendário
 * primário. Idempotente por tarefa: se já existe um evento espelhado, atualiza.
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
    const headers = await googleHeaders(userId);
    const existing = (await latestMirrors(supabase, [task.id as string])).get(task.id as string) ?? null;
    const r = await pushTaskEvent(supabase, userId, headers, task as SyncTask, existing, {
      durationMinutes: data.durationMinutes,
      withMeet: data.withMeet,
    });
    return { ok: true as const, eventId: r.eventId, meetLink: r.meetLink, htmlLink: r.htmlLink };
  });

/**
 * Sincronização rápida logo após editar: só as tarefas indicadas, em paralelo.
 * Tarefa sem data cujo evento existia tem o evento removido do Google.
 * Nunca lança: o Core continua salvo mesmo se o Google falhar.
 */
export const syncTasksNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskIds: z.array(z.string().uuid()).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let headers: Record<string, string>;
    try {
      headers = await googleHeaders(userId);
    } catch {
      return { ok: false as const, synced: 0 };
    }
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, owner_id, title, description, due_date, briefing")
      .in("id", data.taskIds);
    const mirrors = await latestMirrors(supabase, data.taskIds);
    let synced = 0;
    await runPool((tasks ?? []) as SyncTask[], 5, async (t) => {
      const m = mirrors.get(t.id) ?? null;
      try {
        if (!t.due_date) {
          if (m?.provider_id) {
            await fetch(`${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events/${m.provider_id}`, { method: "DELETE", headers });
            await supabase.from("task_communications").delete().eq("id", m.id);
          }
          return;
        }
        // Pedido explícito após editar: envia mesmo se título e horário não mudaram (descrição pode ter mudado).
        await pushTaskEvent(supabase, userId, headers, t, m, { durationMinutes: 60 });
        synced++;
      } catch {
        // segue com as demais
      }
    });
    return { ok: true as const, synced };
  });

/** Remove do Google o evento espelhado de uma tarefa (antes de excluir a tarefa). */
export const unsyncTaskFromCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const m = (await latestMirrors(supabase, [data.taskId])).get(data.taskId);
    if (!m?.provider_id) return { ok: true as const, removed: false };
    try {
      const headers = await googleHeaders(userId);
      await fetch(`${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events/${m.provider_id}`, { method: "DELETE", headers });
      return { ok: true as const, removed: true };
    } catch {
      return { ok: false as const, removed: false };
    }
  });

/**
 * Conferência geral (reserva): envia ao Google só o que falta ou mudou, dos
 * últimos 30 dias em diante, em paralelo. Antes reenviava tudo, uma a uma.
 */
export const syncAllPendingTasksToCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("id, owner_id, title, description, due_date, briefing")
      .eq("owner_id", userId)
      .not("due_date", "is", null)
      .gte("due_date", since)
      .limit(500);
    if (error) throw new Error(error.message);

    let headers: Record<string, string>;
    try {
      headers = await googleHeaders(userId);
    } catch (e: any) {
      // Conta Google não conectada / token revogado: não quebra a Agenda.
      return {
        ok: false as const,
        reason: (e?.message as string) ?? "Conta Google não conectada.",
        created: 0, updated: 0, failed: 0, total: 0, errors: [] as string[],
      };
    }

    const list = (tasks ?? []) as SyncTask[];
    const mirrors = await latestMirrors(supabase, list.map((t) => t.id));
    const todo = list.filter((t) => !mirrorUpToDate(t, mirrors.get(t.id)));
    let created = 0, updated = 0, failed = 0;
    const errors: string[] = [];
    await runPool(todo, 5, async (t) => {
      try {
        const r = await pushTaskEvent(supabase, userId, headers, t, mirrors.get(t.id) ?? null, { durationMinutes: 60 });
        if (r.created) created++; else updated++;
      } catch (e: any) {
        failed++;
        errors.push(`${t.title}: ${e?.message ?? "erro"}`);
      }
    });

    return { ok: true as const, created, updated, failed, total: list.length, errors: errors.slice(0, 5) };
  });
