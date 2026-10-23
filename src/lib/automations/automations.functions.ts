import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const MIGRATION_HINT = "Rode a migração 22 no SQL Editor para ativar automações e modelos de e-mail.";
const friendly = (msg: string) => (/does not exist|schema cache|relation/i.test(msg) ? MIGRATION_HINT : msg);

/* ───────────── Modelos de e-mail ───────────── */

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("email_templates")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("name");
    if (error) return { templates: [] as any[], ready: false, message: friendly(error.message) };
    return { templates: (rows ?? []) as any[], ready: true, message: null };
  });

export const saveEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: uuid.optional(),
      organizationId: uuid,
      name: z.string().trim().min(1).max(120),
      subject: z.string().trim().min(1).max(300),
      body: z.string().max(20000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const row = { organization_id: data.organizationId, name: data.name, subject: data.subject, body: data.body, updated_at: new Date().toISOString() };
    const db = context.supabase as any;
    const { error } = data.id
      ? await db.from("email_templates").update(row).eq("id", data.id)
      : await db.from("email_templates").insert({ ...row, owner_id: context.userId });
    if (error) throw new Error(friendly(error.message));
    return { ok: true as const };
  });

export const deleteEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("email_templates").delete().eq("id", data.id);
    if (error) throw new Error(friendly(error.message));
    return { ok: true as const };
  });

/** Teste do modelo: envia para o próprio e-mail de quem testa, com dados de exemplo. */
export const sendTestEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subject: z.string().min(1).max(300), body: z.string().max(20000), to: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    const { renderTemplate } = await import("./rules");
    const sample = { id: "x", name: "Maria Souza", company: "Empresa Exemplo", email: data.to, phone: "(12) 99999-0000", city: "Taubaté", state: "SP", value: 5000, openTasks: 0, overdueTasks: 0 };
    const extra = { etapa: "Proposta", pipeline: "Pipeline principal", responsavel: "Você" };
    const { sendGmail } = await import("@/lib/google/gmail-send.server");
    await sendGmail(context.userId, [data.to], `[Teste] ${renderTemplate(data.subject, sample, extra)}`, renderTemplate(data.body, sample, extra));
    return { ok: true as const };
  });

/* ───────────── Automações ───────────── */

const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("on_enter") }),
  z.object({ type: z.literal("after_time"), minutes: z.number().int().min(5).max(525600) }),
  z.object({ type: z.literal("on_enter_with_tag"), tag: z.string().min(1).max(40) }),
  z.object({ type: z.literal("on_tag_added"), tag: z.string().min(1).max(40) }),
]);
const conditionSchema = z.union([
  z.object({ field: z.enum(["tags_any", "tags_none", "temperature"]), value: z.array(z.string().max(40)).max(30) }),
  z.object({ field: z.enum(["value_gte", "value_lte"]), value: z.number() }),
  z.object({ field: z.enum(["no_open_tasks", "has_overdue_task", "has_email", "has_phone"]) }),
]);
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move_stage"), stage_id: uuid }),
  z.object({ type: z.literal("add_tag"), tag: z.string().min(1).max(40) }),
  z.object({ type: z.literal("remove_tag"), tag: z.string().min(1).max(40) }),
  z.object({ type: z.literal("set_temperature"), value: z.enum(["quente", "morno", "frio"]) }),
  z.object({ type: z.literal("send_email"), template_id: uuid }),
  z.object({
    type: z.literal("create_task"),
    kind: z.enum(["tarefa", "reuniao", "call", "follow_up"]),
    title: z.string().min(1).max(200),
    days: z.number().int().min(0).max(365),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    priority: z.enum(["baixa", "media", "alta", "critica"]),
    duration: z.number().int().min(10).max(480),
  }),
  z.object({ type: z.literal("add_note"), text: z.string().min(1).max(2000) }),
]);

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pipelineId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: rows, error } = await db
      .from("pipeline_automations")
      .select("*")
      .eq("pipeline_id", data.pipelineId)
      .order("position");
    if (error) return { automations: [] as any[], runs: [] as any[], ready: false, message: friendly(error.message) };
    const ids = (rows ?? []).map((r: any) => r.id);
    const { data: runs } = ids.length
      ? await db.from("automation_runs").select("id, automation_id, lead_id, status, detail, created_at, leads(name)")
          .in("automation_id", ids).order("created_at", { ascending: false }).limit(60)
      : { data: [] };
    return { automations: (rows ?? []) as any[], runs: (runs ?? []) as any[], ready: true, message: null };
  });

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: uuid.optional(),
      organizationId: uuid,
      pipelineId: uuid,
      stageId: uuid,
      name: z.string().trim().min(1).max(160),
      active: z.boolean(),
      trigger: triggerSchema,
      conditions: z.array(conditionSchema).max(20),
      actions: z.array(actionSchema).min(1).max(20),
      position: z.number().int().min(0).default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    // A etapa precisa ser deste pipeline (e visível para quem salva).
    const { data: stage } = await db.from("pipeline_stages").select("id, pipeline_id").eq("id", data.stageId).maybeSingle();
    if (!stage || stage.pipeline_id !== data.pipelineId) throw new Error("Etapa inválida para este pipeline.");
    const row = {
      organization_id: data.organizationId,
      pipeline_id: data.pipelineId,
      stage_id: data.stageId,
      name: data.name,
      active: data.active,
      trigger: data.trigger,
      conditions: data.conditions,
      actions: data.actions,
      position: data.position,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await db.from("pipeline_automations").update(row).eq("id", data.id)
      : await db.from("pipeline_automations").insert({ ...row, owner_id: context.userId });
    if (error) throw new Error(friendly(error.message));
    return { ok: true as const };
  });

export const toggleAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("pipeline_automations").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(friendly(error.message));
    return { ok: true as const };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("pipeline_automations").delete().eq("id", data.id);
    if (error) throw new Error(friendly(error.message));
    return { ok: true as const };
  });

/**
 * Verifica as automações por tempo da empresa (chamado ao abrir o Pipeline, além
 * da verificação periódica). Confere antes que quem pede é da empresa.
 */
export const runDueAutomationsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await (context.supabase as any).rpc("is_org_member", { _org: data.organizationId });
    if (!ok) return { checked: 0, ran: 0 };
    const { runDueAutomations } = await import("./engine.server");
    return runDueAutomations({ organizationId: data.organizationId, limit: 100 });
  });
