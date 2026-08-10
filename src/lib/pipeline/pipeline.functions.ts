import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_STAGES } from "./defaults";

const uuid = z.string().uuid();

/* ---------------- Stages ---------------- */

export const listPipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    let { data: stages } = await supabase
      .from("pipeline_stages")
      .select("*")
      .order("position");

    if (!stages || stages.length === 0) {
      const rows = DEFAULT_STAGES.map((s, i) => ({
        owner_id: userId,
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

    const { data: leads, error: lerr } = await supabase
      .from("leads")
      .select("*")
      .order("position");
    if (lerr) throw new Error(lerr.message);

    return { stages: stages ?? [], leads: leads ?? [] };
  });

export const upsertStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
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
    const [notes, events] = await Promise.all([
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
    ]);
    return { notes: notes.data ?? [], events: events.data ?? [] };
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
