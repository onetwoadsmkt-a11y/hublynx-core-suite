import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_STAGES } from "./defaults";

const uuid = z.string().uuid();

/* ---------------- Pipelines ---------------- */

export const listPipelines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let { data } = await supabase.from("pipelines").select("*").order("position");
    if (!data || data.length === 0) {
      const { data: created, error } = await supabase
        .from("pipelines")
        .insert({ owner_id: userId, name: "Pipeline principal", position: 0 })
        .select("*");
      if (error) throw new Error(error.message);
      data = created ?? [];
    }
    return data;
  });

export const createPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(80), seedStages: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("pipelines")
      .select("id", { count: "exact", head: true });
    const { data: row, error } = await supabase
      .from("pipelines")
      .insert({ owner_id: userId, name: data.name, position: count ?? 0 })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.seedStages !== false) {
      await supabase.from("pipeline_stages").insert(
        DEFAULT_STAGES.map((s, i) => ({
          owner_id: userId,
          pipeline_id: row.id,
          name: s.name,
          color: s.color,
          position: i,
          is_won: s.is_won ?? false,
          is_lost: s.is_lost ?? false,
        })),
      );
    }
    return row;
  });

export const renamePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, name: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("pipelines")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deletePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pipelines").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ---------------- Stages ---------------- */

export const listPipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ pipelineId: uuid.optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let { data: pipelines } = await supabase.from("pipelines").select("*").order("position");
    if (!pipelines || pipelines.length === 0) {
      const { data: created, error } = await supabase
        .from("pipelines")
        .insert({ owner_id: userId, name: "Pipeline principal", position: 0 })
        .select("*");
      if (error) throw new Error(error.message);
      pipelines = created ?? [];
    }

    const current =
      pipelines.find((p) => p.id === data.pipelineId) ?? pipelines[0]!;
    const isFirst = current.id === pipelines[0]!.id;

    let { data: stages } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", current.id)
      .order("position");

    if (!stages || stages.length === 0) {
      // adota etapas antigas sem pipeline no funil principal
      if (isFirst) {
        await supabase
          .from("pipeline_stages")
          .update({ pipeline_id: current.id })
          .is("pipeline_id", null);
        const { data: adopted } = await supabase
          .from("pipeline_stages")
          .select("*")
          .eq("pipeline_id", current.id)
          .order("position");
        stages = adopted ?? [];
      }
      if (!stages || stages.length === 0) {
        const rows = DEFAULT_STAGES.map((s, i) => ({
          owner_id: userId,
          pipeline_id: current.id,
          name: s.name,
          color: s.color,
          position: i,
          is_won: s.is_won ?? false,
          is_lost: s.is_lost ?? false,
        }));
        const { data: created, error } = await supabase
          .from("pipeline_stages")
          .insert(rows)
          .select("*");
        if (error) throw new Error(error.message);
        stages = created ?? [];
      }
    }

    const stageIds = (stages ?? []).map((s) => s.id);
    const query = supabase.from("leads").select("*").order("position");
    const { data: leads, error: lerr } = await (isFirst
      ? query.or(`stage_id.in.(${stageIds.join(",")}),stage_id.is.null`)
      : query.in("stage_id", stageIds));
    if (lerr) throw new Error(lerr.message);

    return { pipelines, pipeline: current, stages: stages ?? [], leads: leads ?? [] };
  });

export const upsertStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        pipeline_id: uuid.optional(),
        name: z.string().min(1).max(60),
        color: z.string().min(3).max(30),
        position: z.number().int().min(0).optional(),
        is_won: z.boolean().optional(),
        is_lost: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("pipeline_stages")
      .upsert({ ...data, owner_id: userId });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("pipeline_stages")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const reorderStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(uuid).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await Promise.all(
      data.ids.map((id, i) =>
        context.supabase.from("pipeline_stages").update({ position: i }).eq("id", id),
      ),
    );
    return { ok: true as const };
  });

/* ---------------- Leads ---------------- */

const leadSchema = z.object({
  id: uuid.optional(),
  stage_id: uuid.nullable().optional(),
  client_id: uuid.nullable().optional(),
  name: z.string().min(1).max(200),
  company: z.string().max(200).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  state: z.string().max(60).nullable().optional(),
  source: z.string().max(120).nullable().optional(),
  value: z.number().nonnegative().nullable().optional(),
  status: z.string().max(30).optional(),
  temperature: z.enum(["quente", "morno", "frio"]).nullable().optional(),
  utm_source: z.string().max(200).nullable().optional(),
  utm_medium: z.string().max(200).nullable().optional(),
  utm_campaign: z.string().max(200).nullable().optional(),
  utm_term: z.string().max(200).nullable().optional(),
  utm_content: z.string().max(200).nullable().optional(),
  gclid: z.string().max(200).nullable().optional(),
  fbclid: z.string().max(200).nullable().optional(),
  landing_url: z.string().max(600).nullable().optional(),
  referrer: z.string().max(600).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const upsertLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => leadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("leads")
      .upsert({ ...data, owner_id: userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const moveLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, stage_id: uuid, position: z.number().int().min(0).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ stage_id: data.stage_id, position: data.position ?? 0 })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ---------------- Notes + Journey ---------------- */

export const getLeadDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [notes, events, tasks, files] = await Promise.all([
      supabase
        .from("lead_notes")
        .select("*")
        .eq("lead_id", data.leadId)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_events")
        .select("*")
        .eq("lead_id", data.leadId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("lead_tasks")
        .select("*")
        .eq("lead_id", data.leadId)
        .order("due_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("lead_files")
        .select("*")
        .eq("lead_id", data.leadId)
        .order("created_at", { ascending: false }),
    ]);
    return {
      notes: notes.data ?? [],
      events: events.data ?? [],
      tasks: tasks.data ?? [],
      files: files.data ?? [],
    };

  });

export const addLeadNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: uuid, body: z.string().min(1).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("lead_notes").insert({
      lead_id: data.leadId,
      owner_id: userId,
      author_id: userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ---------------- Webhooks ---------------- */

export const listWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("lead_webhooks")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Todas as etapas de todos os pipelines (para escolher o destino de um webhook). */
export const listAllStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: pipes } = await supabase.from("pipelines").select("id, name, position").order("position");
    const { data: stages, error } = await supabase
      .from("pipeline_stages")
      .select("id, name, pipeline_id, position")
      .order("position");
    if (error) throw new Error(error.message);
    const byId = new Map((pipes ?? []).map((p) => [p.id, p.name]));
    return (stages ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      pipeline_id: s.pipeline_id,
      pipeline_name: s.pipeline_id ? byId.get(s.pipeline_id) ?? "Sem pipeline" : "Sem pipeline",
    }));
  });

export const createWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(80),
        direction: z.enum(["inbound", "outbound"]).default("inbound"),
        target_url: z.string().url().max(600).nullable().optional(),
        default_stage_id: uuid.nullable().optional(),
        default_source: z.string().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("lead_webhooks")
      .insert({ ...data, owner_id: userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        default_stage_id: uuid.nullable().optional(),
        default_source: z.string().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("lead_webhooks")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateWebhookMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        field_map: z.record(
          z.string().max(60),
          z.union([z.string().max(200), z.object({ const: z.string().max(200) })]).nullable(),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_webhooks")
      .update({ field_map: data.field_map })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const reprocessLastPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, create: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: hook, error } = await supabase
      .from("lead_webhooks")
      .select("id, field_map, last_payload, default_stage_id, default_source")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (!hook.last_payload) return { preview: null, created: false as const };

    const { buildLeadFromPayload } = await import("./lead-mapping");
    const mapped = buildLeadFromPayload(hook.last_payload, (hook.field_map ?? {}) as never);
    const preview: Record<string, string | undefined> = {
      ...mapped,
      source: mapped["source"] ?? hook.default_source ?? "webhook",
    };

    if (data.create && preview["name"]) {
      await supabase.from("leads").insert({
        owner_id: userId,
        stage_id: hook.default_stage_id,
        ...preview,
        value: preview["value"] ? Number(preview["value"]) : null,
        metadata: hook.last_payload as never,
      } as never);
      return { preview, created: true as const };
    }
    return { preview, created: false as const };
  });


export const toggleWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_webhooks")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lead_webhooks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ---------------- Lead tasks (agendamentos) ---------------- */

export const upsertLeadTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        leadId: uuid,
        title: z.string().min(1).max(200),
        kind: z.enum(["tarefa", "reuniao", "call", "follow_up"]).default("tarefa"),
        notes: z.string().max(2000).nullable().optional(),
        due_at: z.string().nullable().optional(),
        duration_minutes: z.number().int().min(10).max(480).default(30),
        invite_lead: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, email")
      .eq("id", data.leadId)
      .maybeSingle();

    let existingEventId: string | null = null;
    if (data.id) {
      const { data: prev } = await supabase
        .from("lead_tasks")
        .select("gcal_event_id")
        .eq("id", data.id)
        .maybeSingle();
      existingEventId = (prev?.gcal_event_id as string | null) ?? null;
    }

    let gcalEventId: string | null = existingEventId;
    let meetLink: string | null = null;
    let syncError: string | null = null;

    if (data.due_at) {
      const { upsertLeadCalendarEvent } = await import("@/lib/google/lead-calendar.server");
      const res = await upsertLeadCalendarEvent({
        title: `[${lead?.name ?? "Lead"}] ${data.title}`,
        kind: data.kind,
        description: data.notes ?? null,
        startISO: data.due_at,
        durationMinutes: data.duration_minutes,
        attendees: data.invite_lead && lead?.email ? [lead.email as string] : [],
        withMeet: data.kind === "reuniao",
        eventId: existingEventId,
      });
      if (res.error) syncError = res.error;
      else {
        gcalEventId = res.eventId ?? existingEventId;
        meetLink = res.meetLink;
      }
    }

    const row = {
      lead_id: data.leadId,
      owner_id: userId,
      title: data.title,
      kind: data.kind,
      notes: data.notes ?? null,
      due_at: data.due_at || null,
      duration_minutes: data.duration_minutes,
      gcal_event_id: gcalEventId,
      meet_link: meetLink,
    };
    const { error } = data.id
      ? await supabase.from("lead_tasks").update(row).eq("id", data.id)
      : await supabase.from("lead_tasks").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true as const, synced: !!gcalEventId, meetLink, syncError };
  });

export const toggleLeadTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, done: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lead_tasks")
      .update({ done: data.done, completed_at: data.done ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteLeadTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase
      .from("lead_tasks")
      .select("gcal_event_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("lead_tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (prev?.gcal_event_id) {
      const { deleteLeadCalendarEvent } = await import("@/lib/google/lead-calendar.server");
      await deleteLeadCalendarEvent(prev.gcal_event_id as string);
    }
    return { ok: true as const };
  });


/* ---------------- Lead files ---------------- */

export const registerLeadFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: uuid,
        name: z.string().min(1).max(300),
        storage_path: z.string().min(1).max(600),
        mime_type: z.string().max(200).nullable().optional(),
        size_bytes: z.number().int().nonnegative().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("lead_files").insert({
      lead_id: data.leadId,
      owner_id: userId,
      name: data.name,
      storage_path: data.storage_path,
      mime_type: data.mime_type ?? null,
      size_bytes: data.size_bytes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteLeadFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lead_files").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ---------------- Lista de leads (todos os pipelines) ---------------- */

export const listAllLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: pipelines }, { data: stages }, { data: leads, error }] = await Promise.all([
      supabase.from("pipelines").select("*").order("position"),
      supabase.from("pipeline_stages").select("*").order("position"),
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
    ]);
    if (error) throw new Error(error.message);
    return {
      pipelines: pipelines ?? [],
      stages: stages ?? [],
      leads: leads ?? [],
    };
  });
