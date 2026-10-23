import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_STAGES } from "./defaults";
import { scopeOrganization, organizationFields } from "@/lib/org/filter";
import { resolveOrganizationId } from "@/lib/org/resolve";
import { fetchAllRows } from "@/lib/supabase-paging";
import { appendNote, stamp } from "./lead-task-notes";

const uuid = z.string().uuid();

/** Empresa herdada do lead (notas, tarefas e arquivos seguem o lead). */
async function leadOrganizationId(db: any, leadId: string): Promise<string | null> {
  const { data } = await db.from("leads").select("organization_id").eq("id", leadId).maybeSingle();
  return (data?.organization_id as string | undefined) ?? null;
}

/* ---------------- Pipelines ---------------- */

export const listPipelines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let { data } = await supabase.from("pipelines").select("*").order("position");
    if (!data || data.length === 0) {
      const orgId = await resolveOrganizationId(supabase as never, userId);
      const { data: created, error } = await supabase
        .from("pipelines")
        .insert({
          owner_id: userId,
          ...organizationFields(orgId),
          name: "Pipeline principal",
          position: 0,
        } as never)
        .select("*");
      if (error) throw new Error(error.message);
      data = created ?? [];
    }
    return data;
  });

export const createPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(80),
        seedStages: z.boolean().optional(),
        organizationId: uuid.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await resolveOrganizationId(supabase as never, userId, data.organizationId);
    const { count } = await supabase
      .from("pipelines")
      .select("id", { count: "exact", head: true });
    const { data: row, error } = await supabase
      .from("pipelines")
      .insert({
        owner_id: userId,
        ...organizationFields(orgId),
        name: data.name,
        position: count ?? 0,
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.seedStages !== false) {
      await supabase.from("pipeline_stages").insert(
        DEFAULT_STAGES.map((s, i) => ({
          owner_id: userId,
          ...organizationFields(orgId),
          pipeline_id: row.id,
          name: s.name,
          color: s.color,
          position: i,
          is_won: s.is_won ?? false,
          is_lost: s.is_lost ?? false,
        })) as never,
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
    z.object({ pipelineId: uuid.optional(), organizationId: uuid.optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await resolveOrganizationId(supabase as never, userId, data.organizationId);

    let { data: pipelines } = await supabase.from("pipelines").select("*").order("position");
    if (!pipelines || pipelines.length === 0) {
      const { data: created, error } = await supabase
        .from("pipelines")
        .insert({
          owner_id: userId,
          ...organizationFields(orgId),
          name: "Pipeline principal",
          position: 0,
        } as never)
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
          ...organizationFields(orgId),
          pipeline_id: current.id,
          name: s.name,
          color: s.color,
          position: i,
          is_won: s.is_won ?? false,
          is_lost: s.is_lost ?? false,
        }));
        const { data: created, error } = await supabase
          .from("pipeline_stages")
          .insert(rows as never)
          .select("*");
        if (error) throw new Error(error.message);
        stages = created ?? [];
      }
    }

    const stageIds = (stages ?? []).map((s) => s.id);
    const leads = stageIds.length
      ? await fetchAllRows(() => {
          const query = scopeOrganization(
            supabase
              .from("leads")
              .select("*")
              .order("created_at", { ascending: false })
              .order("id", { ascending: true }),
            orgId,
          );
          return isFirst
            ? query.or(`stage_id.in.(${stageIds.join(",")}),stage_id.is.null`)
            : query.in("stage_id", stageIds);
        })
      : [];

    // Tarefas em aberto dos leads (filtros "com tarefas agendadas", "atrasadas", "sem tarefas").
    const leadIds = (leads ?? []).map((l: any) => l.id as string);
    const chunks: string[][] = [];
    for (let i = 0; i < leadIds.length; i += 300) chunks.push(leadIds.slice(i, i + 300));
    const taskParts = await Promise.all(
      chunks.map((chunk) =>
        supabase.from("lead_tasks").select("lead_id, done, due_at").eq("done", false).in("lead_id", chunk),
      ),
    );
    const leadTasks = taskParts.flatMap((r) => (r.data ?? []) as { lead_id: string; done: boolean; due_at: string | null }[]);

    return { pipelines, pipeline: current, stages: stages ?? [], leads: leads ?? [], leadTasks };
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

    if (data.id) {
      const { data: existing } = await supabase
        .from("pipeline_stages")
        .select("is_won,is_lost")
        .eq("id", data.id)
        .maybeSingle();
      if (existing?.is_won || existing?.is_lost) {
        // Etapas fixas (Ganho / Perdido): só a posição pode mudar.
        if (data.position != null) {
          await supabase
            .from("pipeline_stages")
            .update({ position: data.position })
            .eq("id", data.id);
        }
        return { ok: true as const };
      }
    }

    const orgId = await resolveOrganizationId(supabase as never, userId);
    const { error } = await supabase
      .from("pipeline_stages")
      .upsert({ ...data, owner_id: userId, ...organizationFields(orgId) } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("pipeline_stages")
      .select("is_won,is_lost")
      .eq("id", data.id)
      .maybeSingle();
    if (existing?.is_won || existing?.is_lost) {
      throw new Error("As etapas Venda ganha e Desqualificado são fixas e não podem ser removidas.");
    }
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
  next_action: z.string().max(200).nullable().optional(),
  next_action_at: z.string().max(40).nullable().optional(),
});

export const upsertLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => leadSchema.extend({ organizationId: uuid.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { organizationId, ...lead } = data;
    // Lead existente: preserva id, empresa e owner_id. Lead novo: recebe a empresa
    // ativa (validada no servidor) e o owner_id do usuário autenticado.
    const orgId = lead.id
      ? null
      : await resolveOrganizationId(supabase as never, userId, organizationId);
    const { data: before } = lead.id
      ? await supabase.from("leads").select("stage_id").eq("id", lead.id).maybeSingle()
      : { data: null };
    const payload = lead.id
      ? { ...lead, owner_id: userId }
      : { ...lead, owner_id: userId, ...organizationFields(orgId) };
    const { data: row, error } = await supabase
      .from("leads")
      .upsert(payload as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    // Lead novo ou trocado de etapa: automações da etapa.
    if (row?.stage_id && (!lead.id || before?.stage_id !== row.stage_id)) {
      const { fireLeadAutomations } = await import("@/lib/automations/engine.server");
      await fireLeadAutomations({ leadId: row.id as string, event: { kind: "enter" } });
    }
    return row;
  });

export const moveLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, stage_id: uuid, position: z.number().int().min(0).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: stage } = await context.supabase
      .from("pipeline_stages")
      .select("is_won,is_lost")
      .eq("id", data.stage_id)
      .maybeSingle();

    // Trava: lead em etapa final (Venda ganha / Desqualificado) não pode sair
    const { data: current } = await context.supabase
      .from("leads")
      .select("stage_id")
      .eq("id", data.id)
      .maybeSingle();
    if (current?.stage_id && current.stage_id !== data.stage_id) {
      const { data: curStage } = await context.supabase
        .from("pipeline_stages")
        .select("is_won,is_lost")
        .eq("id", current.stage_id)
        .maybeSingle();
      if (curStage?.is_won || curStage?.is_lost) {
        throw new Error(
          curStage.is_won
            ? "Lead já convertido em venda ganha — não pode ser movido."
            : "Lead desqualificado — não pode ser movido.",
        );
      }
    }

    const status = stage?.is_won ? "ganho" : stage?.is_lost ? "perdido" : "aberto";

    const { error } = await context.supabase
      .from("leads")
      .update({ stage_id: data.stage_id, position: data.position ?? 0, status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    // Entrou numa etapa nova: automações da etapa (mover, tag, e-mail, tarefa…).
    if (current?.stage_id !== data.stage_id) {
      const { fireLeadAutomations } = await import("@/lib/automations/engine.server");
      await fireLeadAutomations({ leadId: data.id, event: { kind: "enter" } });
    }
    return { ok: true as const, is_won: !!stage?.is_won, is_lost: !!stage?.is_lost };
  });

/** Ordem manual dos cards dentro de uma etapa (arrastar e soltar). */
export const reorderLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        stage_id: uuid,
        items: z.array(z.object({ id: uuid, position: z.number().int().min(0) })).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Grava só os cards que mudaram de posição, em lotes, e sempre restrito à etapa.
    const chunks: (typeof data.items)[] = [];
    for (let i = 0; i < data.items.length; i += 25) chunks.push(data.items.slice(i, i + 25));
    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map((it) =>
          context.supabase
            .from("leads")
            .update({ position: it.position })
            .eq("id", it.id)
            .eq("stage_id", data.stage_id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
    }
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
    const orgId = await leadOrganizationId(supabase, data.leadId);
    const { error } = await supabase.from("lead_notes").insert({
      lead_id: data.leadId,
      owner_id: userId,
      ...organizationFields(orgId),
      author_id: userId,
      body: data.body,
    } as never);
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

/** Todas as etapas de todos os pipelines da empresa (webhooks e mover lead entre pipelines). */
export const listAllStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: uuid.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: pipes } = await scopeOrganization(
      supabase.from("pipelines").select("id, name, position").order("position"),
      data.organizationId,
    );
    const { data: stages, error } = await scopeOrganization(
      supabase.from("pipeline_stages").select("id, name, pipeline_id, position").order("position"),
      data.organizationId,
    );
    if (error) throw new Error(error.message);
    const pipeList = pipes ?? [];
    const byId = new Map(pipeList.map((p) => [p.id, p.name]));
    const pipeOrder = new Map(pipeList.map((p, i) => [p.id, i]));
    return (stages ?? [])
      .map((s) => ({
        id: s.id,
        name: s.name,
        pipeline_id: s.pipeline_id,
        position: s.position,
        pipeline_name: s.pipeline_id ? byId.get(s.pipeline_id) ?? "Sem pipeline" : "Sem pipeline",
      }))
      .sort(
        (a, b) =>
          (pipeOrder.get(a.pipeline_id ?? "") ?? 999) - (pipeOrder.get(b.pipeline_id ?? "") ?? 999) ||
          (a.position ?? 0) - (b.position ?? 0),
      );
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
    const orgId = await resolveOrganizationId(supabase as never, userId);
    const { data: row, error } = await supabase
      .from("lead_webhooks")
      .insert({ ...data, owner_id: userId, ...organizationFields(orgId) } as never)
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
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, create: z.boolean().optional(), organizationId: uuid.optional() }).parse(d),
  )
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
      const orgId = await resolveOrganizationId(supabase as never, userId, data.organizationId);
      await supabase.from("leads").insert({
        owner_id: userId,
        ...organizationFields(orgId),
        stage_id: hook.default_stage_id,
        ...preview,
        value: preview["value"] ? Number(preview["value"]) : null,
        lead_score:
          preview["lead_score"] !== undefined && preview["lead_score"] !== ""
            ? Number(preview["lead_score"])
            : null,
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

const leadTaskSchema = z.object({
  id: uuid.optional(),
  leadId: uuid,
  title: z.string().min(1).max(200),
  kind: z.enum(["tarefa", "reuniao", "call", "follow_up"]).default("tarefa"),
  notes: z.string().max(8000).nullable().optional(),
  due_at: z.string().nullable().optional(),
  duration_minutes: z.number().int().min(10).max(480).default(30),
  invite_lead: z.boolean().default(false),
  priority: z.enum(["baixa", "media", "alta", "critica"]).optional(),
});
type LeadTaskInput = z.infer<typeof leadTaskSchema>;

/**
 * Salva um agendamento de lead e sincroniza com o Google Agenda de quem salva.
 * Usado ao criar/editar e ao agendar a próxima ação depois de concluir uma tarefa.
 * O gatilho do banco registra "Agendamento criado" na jornada do lead.
 */
async function saveLeadTask(context: { supabase: any; userId: string }, data: LeadTaskInput) {
  const { supabase, userId } = context;

  const { data: leadRow, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", data.leadId)
    .maybeSingle();

  if (leadError) throw new Error(leadError.message);
  if (!leadRow) throw new Error("Lead não encontrado ou sem permissão.");
  const lead = leadRow as { name?: string; email?: string | null; organization_id?: string | null };

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
    const res = await upsertLeadCalendarEvent(userId, {
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

  const row: Record<string, unknown> = {
    lead_id: data.leadId,
    title: data.title,
    ...organizationFields((lead.organization_id as string | null) ?? null),
    kind: data.kind,
    notes: data.notes ?? null,
    due_at: data.due_at || null,
    duration_minutes: data.duration_minutes,
    gcal_event_id: gcalEventId,
    meet_link: meetLink,
  };
  // O dono do agendamento é quem criou; editar não troca o responsável.
  if (!data.id) row.owner_id = userId;

  const save = (values: Record<string, unknown>) =>
    data.id
      ? supabase.from("lead_tasks").update(values).eq("id", data.id).select("id").maybeSingle()
      : supabase.from("lead_tasks").insert(values).select("id").maybeSingle();
  let priorityPending = false;
  let { data: saved, error } = await save(data.priority ? { ...row, priority: data.priority } : row);
  // Antes da migração 21 a coluna priority não existe: salva sem ela e avisa.
  if (error && data.priority && /priority/i.test(error.message)) {
    priorityPending = true;
    ({ data: saved, error } = await save(row));
  }
  if (error) throw new Error(error.message);
  return {
    ok: true as const,
    id: ((saved as { id?: string } | null)?.id ?? data.id ?? null) as string | null,
    synced: !!gcalEventId,
    meetLink,
    syncError,
    priorityPending,
  };
}

/** Concluído no Core → "✓" e cor grafite no Google (sem reenviar convites). */
async function markLeadTaskInGoogle(
  userId: string,
  row: { title?: string; gcal_event_id?: string | null; leads?: { name?: string } | null } | null,
  done: boolean,
) {
  if (!row?.gcal_event_id || !row.title) return;
  const { markCalendarEventDone } = await import("@/lib/google/lead-calendar.server");
  await markCalendarEventDone(userId, row.gcal_event_id, `[${row.leads?.name ?? "Lead"}] ${row.title}`, done);
}

/** Registra um evento na jornada do lead (dono e empresa herdados do lead). */
async function logLeadEvent(
  supabase: any,
  userId: string,
  leadId: string,
  ev: { kind: string; title: string; description?: string | null; meta?: Record<string, unknown> },
) {
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) return;
  await supabase.from("lead_events").insert({
    lead_id: leadId,
    owner_id: (lead as any).owner_id ?? userId,
    actor_id: userId,
    kind: ev.kind,
    title: ev.title,
    description: ev.description ?? null,
    meta: ev.meta ?? null,
    ...organizationFields(((lead as any).organization_id as string | null) ?? null),
  });
}

export const upsertLeadTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => leadTaskSchema.parse(d))
  .handler(async ({ data, context }) => saveLeadTask(context, data));

/** Observação em um agendamento: fica no próprio agendamento e na jornada do lead. */
export const addLeadTaskNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, text: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("lead_tasks")
      .select("id, lead_id, title, notes")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task) throw new Error("Agendamento não encontrado ou sem permissão.");
    const notes = appendNote(task.notes as string | null, data.text, "");
    const { error: upErr } = await supabase.from("lead_tasks").update({ notes }).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    await logLeadEvent(supabase, userId, task.lead_id as string, {
      kind: "task_note",
      title: `Observação · ${task.title}`,
      description: data.text.slice(0, 1000),
      meta: { lead_task_id: data.id },
    });
    return { ok: true as const, notes };
  });

/**
 * Conclui um agendamento com o resultado (como no Kommo) e, se pedido, já agenda
 * a próxima ação. Tudo fica na jornada: resultado, conclusão e novo agendamento.
 */
export const completeLeadTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        result: z.string().trim().max(2000).optional(),
        next: leadTaskSchema.omit({ id: true, leadId: true }).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("lead_tasks")
      .select("id, lead_id, title, notes, done, gcal_event_id, leads(name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task) throw new Error("Agendamento não encontrado ou sem permissão.");

    const result = data.result?.trim() || "";
    const update: Record<string, unknown> = { done: true, completed_at: new Date().toISOString() };
    if (result) update.notes = appendNote(task.notes as string | null, result, "Resultado: ");
    const { error: upErr } = await supabase.from("lead_tasks").update(update as any).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    await markLeadTaskInGoogle(userId, task as any, true);

    if (result) {
      await logLeadEvent(supabase, userId, task.lead_id as string, {
        kind: "task_result",
        title: `Resultado · ${task.title}`,
        description: result.slice(0, 1000),
        meta: { lead_task_id: data.id },
      });
    }

    let next: Awaited<ReturnType<typeof saveLeadTask>> | null = null;
    if (data.next) {
      next = await saveLeadTask(context, { ...data.next, leadId: task.lead_id as string });
      await logLeadEvent(supabase, userId, task.lead_id as string, {
        kind: "next_action",
        title: `Próxima ação · ${data.next.title}`,
        description: data.next.due_at
          ? `Agendada para ${stamp(new Date(data.next.due_at))}, após concluir "${task.title}"`
          : `Criada após concluir "${task.title}"`,
        meta: { from_lead_task_id: data.id, lead_task_id: next.id, kind: data.next.kind },
      });
    }

    return { ok: true as const, next };
  });

export const toggleLeadTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, done: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("lead_tasks")
      .update({ done: data.done, completed_at: data.done ? new Date().toISOString() : null })
      .eq("id", data.id)
      .select("title, gcal_event_id, leads(name)")
      .maybeSingle();
    if (error) throw new Error(error.message);
    await markLeadTaskInGoogle(context.userId, row as any, data.done);
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
      await deleteLeadCalendarEvent(context.userId, prev.gcal_event_id as string);
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
    const orgId = await leadOrganizationId(supabase, data.leadId);
    const { error } = await supabase.from("lead_files").insert({
      lead_id: data.leadId,
      owner_id: userId,
      ...organizationFields(orgId),
      name: data.name,
      storage_path: data.storage_path,
      mime_type: data.mime_type ?? null,
      size_bytes: data.size_bytes ?? null,
    } as never);
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
  .inputValidator((d: unknown) => z.object({ organizationId: uuid.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: pipelines }, { data: stages }, leads] = await Promise.all([
      supabase.from("pipelines").select("*").order("position"),
      supabase.from("pipeline_stages").select("*").order("position"),
      fetchAllRows(() =>
        scopeOrganization(
          supabase
            .from("leads")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id", { ascending: true }),
          data.organizationId,
        ),
      ),
    ]);
    // Tags dos pipelines visíveis (o RLS já limitou os pipelines a quem pede).
    const { readTagsForPipelines } = await import("./tags.server");
    const byPipeline = await readTagsForPipelines((pipelines ?? []).map((p) => p.id as string));
    const tags = Object.entries(byPipeline).flatMap(([pipelineId, list]) =>
      list.map((t) => ({ ...t, pipeline_id: pipelineId })));
    return {
      pipelines: pipelines ?? [],
      stages: stages ?? [],
      leads: leads ?? [],
      tags,
      wonTagSlugs: [...new Set(tags.filter((t) => t.funnel_key === "ganho").map((t) => t.slug.toLowerCase()))],
      wonStageIds: (stages ?? []).filter((st) => st.is_won).map((st) => st.id as string),
    };
  });
