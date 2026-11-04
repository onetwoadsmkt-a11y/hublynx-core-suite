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
    // Vale para os agendamentos de qualquer pessoa da equipe (o convidado recebe o mesmo
    // evento no Google): ele aparece como "Lead" (laranja, abre o lead), não como Google.
    {
      const { data: ltIds } = await supabase
        .from("lead_tasks")
        .select("gcal_event_id")
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
            googleEventId: ev.id ?? null,
            // convidados (sem a própria pessoa nem salas) — sugestão para criar o lead
            attendees: ((ev.attendees ?? []) as any[])
              .filter((a) => a?.email && !a.self && !a.resource)
              .map((a) => ({ email: String(a.email), name: a.displayName ? String(a.displayName) : null }))
              .slice(0, 20),
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

/**
 * Evento do Google Agenda → lead no Core: cria o lead na etapa escolhida e liga o evento
 * a ele como agendamento (não cria outro evento no Google). Na Agenda o evento passa a
 * aparecer como "Lead" (laranja) e abre o cartão do lead.
 */
export const createLeadFromGoogleEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        stageId: z.string().uuid(),
        name: z.string().trim().min(1).max(200),
        email: z.string().trim().max(200).nullable().optional(),
        phone: z.string().trim().max(60).nullable().optional(),
        company: z.string().trim().max(200).nullable().optional(),
        googleEventId: z.string().min(1).max(1024),
        title: z.string().trim().min(1).max(200),
        start: z.string().min(1),
        end: z.string().nullable().optional(),
        meetLink: z.string().max(1000).nullable().optional(),
        notes: z.string().max(8000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // já ligado a um lead? devolve o mesmo (não duplica)
    const { data: existing } = await supabase
      .from("lead_tasks")
      .select("lead_id")
      .eq("gcal_event_id", data.googleEventId)
      .limit(1)
      .maybeSingle();
    if (existing?.lead_id) return { leadId: existing.lead_id as string, created: false };

    const { data: ok } = await (supabase as any).rpc("is_org_member", { _org: data.organizationId });
    if (!ok) throw new Error("Sem acesso a esta empresa.");
    const { data: stage } = await supabase.from("pipeline_stages").select("id").eq("id", data.stageId).maybeSingle();
    if (!stage) throw new Error("Etapa do pipeline não encontrada.");

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        owner_id: userId,
        organization_id: data.organizationId,
        stage_id: data.stageId,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        source: "Google Agenda",
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const leadId = (lead as { id: string }).id;

    const start = new Date(data.start);
    const end = data.end ? new Date(data.end) : null;
    const minutes = end && end > start ? Math.min(480, Math.max(10, Math.round((end.getTime() - start.getTime()) / 60000))) : 30;
    const { error: tErr } = await supabase.from("lead_tasks").insert({
      lead_id: leadId,
      owner_id: userId,
      organization_id: data.organizationId,
      title: data.title,
      kind: "reuniao",
      notes: data.notes || null,
      due_at: start.toISOString(),
      duration_minutes: minutes,
      gcal_event_id: data.googleEventId,
      meet_link: data.meetLink || null,
    } as never);
    if (tErr) throw new Error(`Lead criado, mas não foi possível ligar a reunião: ${tErr.message}`);

    try {
      const { fireLeadAutomations } = await import("@/lib/automations/engine.server");
      await fireLeadAutomations({ leadId, event: { kind: "enter" } });
    } catch {
      /* automações da etapa são opcionais */
    }
    return { leadId, created: true };
  });
