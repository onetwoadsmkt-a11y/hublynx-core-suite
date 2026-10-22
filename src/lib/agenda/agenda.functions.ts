import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GOOGLE_API_BASE, googleHeaders } from "@/lib/google/google.functions";
import type { AgendaEvent } from "./types";

const rangeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** true: tarefas e agendamentos de lead vêm da fonte compartilhada com Tarefas. */
  skipPending: z.boolean().optional(),
});

const rescheduleSchema = z.object({
  taskId: z.string().uuid(),
  dueDate: z.string().nullable(),
});

export const getAgendaEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fromISO = new Date(data.from).toISOString();
    const toISO = new Date(data.to).toISOString();
    const events: AgendaEvent[] = [];

    // Tasks
    const { data: tasks } = data.skipPending ? { data: [] as any[] } : await supabase
      .from("tasks")
      .select("id, title, due_date, status, priority, client_id, project_id, description, clients(name), projects(name)")
      .eq("owner_id", userId)
      .not("due_date", "is", null)
      .gte("due_date", fromISO)
      .lte("due_date", toISO)
      .limit(500);

    for (const t of tasks ?? []) {
      const due = t.due_date as string;
      const d = new Date(due);
      const allDay = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
      events.push({
        id: `task-${t.id}`,
        source: "task",
        title: t.title as string,
        start: due,
        end: null,
        allDay,
        taskId: t.id as string,
        clientId: (t.client_id as string | null) ?? null,
        clientName: (t as any).clients?.name ?? null,
        projectId: (t.project_id as string | null) ?? null,
        projectName: (t as any).projects?.name ?? null,
        status: t.status as string,
        description: (t.description as string | null) ?? null,
      });
    }

    // Meetings
    const { data: meetings } = await supabase
      .from("task_communications")
      .select("id, subject, start_at, meet_link, task_id, provider_id, metadata, tasks(title, due_date, client_id, clients(name))")
      .eq("owner_id", userId)
      .eq("kind", "meeting")
      .not("start_at", "is", null)
      .gte("start_at", fromISO)
      .lte("start_at", toISO)
      .limit(500);

    // Eventos do Google que já aparecem como item do Core (não repetir no calendário).
    const knownGoogleIds = new Set<string>();
    for (const m of meetings ?? []) {
      if ((m as any).provider_id) knownGoogleIds.add((m as any).provider_id as string);
      const start = m.start_at as string;
      // Espelho da tarefa no Google: a tarefa já está no calendário, não mostra de novo como reunião.
      const taskDue = (m as any).tasks?.due_date as string | null | undefined;
      const isMirror =
        (m as any).metadata?.mirror === true ||
        (!!taskDue && !!start && new Date(taskDue).getTime() === new Date(start).getTime());
      if (isMirror) continue;
      const end = new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
      events.push({
        id: `meet-${m.id}`,
        source: "meeting",
        title: (m.subject as string) || (m as any).tasks?.title || "Reunião",
        start,
        end,
        allDay: false,
        taskId: (m.task_id as string) ?? null,
        clientId: (m as any).tasks?.client_id ?? null,
        clientName: (m as any).tasks?.clients?.name ?? null,
        meetLink: (m.meet_link as string | null) ?? null,
      });
    }

    // Agendamentos de leads (pipeline)
    const { data: leadTasks } = data.skipPending ? { data: [] as any[] } : await supabase
      .from("lead_tasks")
      .select("id, title, kind, due_at, duration_minutes, meet_link, notes, lead_id, leads(name)")
      .eq("owner_id", userId)
      .not("due_at", "is", null)
      .gte("due_at", fromISO)
      .lte("due_at", toISO)
      .limit(500);

    for (const lt of leadTasks ?? []) {
      const start = lt.due_at as string;
      const mins = (lt.duration_minutes as number | null) ?? 30;
      events.push({
        id: `lead-${lt.id}`,
        source: "lead",
        title: `${(lt as any).leads?.name ? `${(lt as any).leads.name} — ` : ""}${lt.title as string}`,
        start,
        end: new Date(new Date(start).getTime() + mins * 60_000).toISOString(),
        allDay: false,
        leadId: (lt.lead_id as string) ?? null,
        meetLink: (lt.meet_link as string | null) ?? null,
        description: (lt.notes as string | null) ?? null,
      });
    }


    // Agendamentos de lead também viram evento no Google: guarda os ids para não duplicar.
    {
      const { data: ltIds } = await supabase
        .from("lead_tasks")
        .select("gcal_event_id")
        .eq("owner_id", userId)
        .not("gcal_event_id", "is", null)
        .gte("due_at", fromISO)
        .lte("due_at", toISO)
        .limit(1000);
      for (const r of ltIds ?? []) if (r.gcal_event_id) knownGoogleIds.add(r.gcal_event_id as string);
    }

    // Eventos do Google Calendar via OAuth próprio do usuário
    try {
      const headers = await googleHeaders(userId);
      const url = new URL(`${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events`);
      url.searchParams.set("timeMin", fromISO);
      url.searchParams.set("timeMax", toISO);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "250");
      const res = await fetch(url.toString(), { headers });
      if (res.ok) {
        const json = (await res.json()) as any;
        for (const ev of (json.items ?? []) as any[]) {
          const s = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00Z` : null);
          const e = ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T00:00:00Z` : null);
          if (!s) continue;
          if (knownGoogleIds.has(ev.id)) continue;
          events.push({
            id: `gcal-${ev.id}`,
            source: "gcal",
            title: ev.summary || "(sem título)",
            start: s,
            end: e,
            allDay: !!ev.start?.date,
            meetLink: ev.hangoutLink ?? null,
            htmlLink: ev.htmlLink ?? null,
            description: ev.description ?? null,
          });
        }
      }
    } catch {
      // silencioso: se o usuário não conectou o Google, ignora eventos externos
    }

    events.sort((a, b) => a.start.localeCompare(b.start));
    return { events };
  });

export const rescheduleTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rescheduleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tasks")
      .update({ due_date: data.dueDate })
      .eq("id", data.taskId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });


export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ taskId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tasks")
      .update({ status: "concluido" })
      .eq("id", data.taskId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
