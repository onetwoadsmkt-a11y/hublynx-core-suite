import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { resolveOrganizationId } from "@/lib/org/resolve";
import {
  calculatePossibleScoreRange,
  compileDefinition,
  formDraftSchema,
  formModeSchema,
  validateScoreRangeCoverage,
  validateScoreRanges,
  validateScoringQuestions,
  type FormDraft,
} from "./domain";

/**
 * Construtor de formulários por empresa (organização).
 * Cada empresa vê e edita só os próprios formulários; o envio público cria o
 * lead direto no pipeline (ver forms-public.functions.ts).
 */

type Db = { from: (t: string) => any };

const uuid = z.string().uuid();
const orgInput = z.object({ organizationId: uuid.nullable().optional() });

const destinationSchema = z.object({
  pipelineId: uuid.nullable().optional(),
  stageId: uuid.nullable().optional(),
  defaultSource: z.string().trim().max(120).nullable().optional(),
});

const editorPayloadSchema = formDraftSchema.extend({ destination: destinationSchema.optional() });

const MAX_ACTIVE_FORMS = 20;

function toJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "formulario"
  );
}

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

/** Empresa ativa do usuário (validada no servidor). */
async function orgContext(userId: string, provided?: string | null) {
  const db = await admin();
  const organizationId = await resolveOrganizationId(db, userId, provided ?? null);
  if (!organizationId) throw new Error("Você não está vinculado a nenhuma empresa.");
  return { db, organizationId };
}

/** Garante que o formulário pertence a uma empresa da qual o usuário participa. */
async function formContext(userId: string, formId: string) {
  const db = await admin();
  const { data: form } = await db.from("lead_forms").select("*").eq("id", formId).maybeSingle();
  if (!form) throw new Error("Formulário não encontrado.");
  const allowed = await resolveOrganizationId(db, userId, form.organization_id);
  if (allowed !== form.organization_id) throw new Error("Formulário não encontrado.");
  return { db, organizationId: form.organization_id as string, form };
}

async function uniqueSlug(db: Db, organizationId: string, base: string) {
  const { data: existing } = await db
    .from("lead_forms")
    .select("slug")
    .eq("organization_id", organizationId)
    .like("slug", `${base}%`);
  const used = new Set(((existing ?? []) as { slug: string }[]).map((item) => item.slug));
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) slug = `${base}-${suffix++}`;
  return slug;
}

/** Pipelines e etapas da empresa, para escolher o destino dos leads. */
async function loadPipelines(db: Db, organizationId: string) {
  const [{ data: pipelines }, { data: stages }] = await Promise.all([
    db.from("pipelines").select("id, name, position").eq("organization_id", organizationId).order("position"),
    db
      .from("pipeline_stages")
      .select("id, name, position, pipeline_id, color, is_won, is_lost")
      .eq("organization_id", organizationId)
      .order("position"),
  ]);
  return ((pipelines ?? []) as { id: string; name: string }[]).map((p) => ({
    id: p.id,
    name: p.name,
    stages: ((stages ?? []) as any[])
      .filter((s) => s.pipeline_id === p.id && !s.is_won && !s.is_lost)
      .map((s) => ({ id: s.id as string, name: s.name as string, color: s.color as string })),
  }));
}

/** Confere que a etapa escolhida pertence ao pipeline e à empresa. */
async function checkDestination(db: Db, organizationId: string, d?: z.infer<typeof destinationSchema>) {
  const pipelineId = d?.pipelineId ?? null;
  let stageId = d?.stageId ?? null;
  if (pipelineId) {
    const { data: p } = await db
      .from("pipelines")
      .select("id")
      .eq("id", pipelineId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!p) throw new Error("Pipeline de destino inválido.");
  }
  if (stageId) {
    const { data: s } = await db
      .from("pipeline_stages")
      .select("id, pipeline_id")
      .eq("id", stageId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!s || (pipelineId && s.pipeline_id !== pipelineId)) stageId = null;
  }
  return { pipeline_id: pipelineId, stage_id: stageId, default_source: d?.defaultSource?.trim() || null };
}

function starterDraft(name: string, mode: FormDraft["mode"]): Omit<FormDraft, "formId"> {
  return {
    name,
    slug: slugify(name),
    mode,
    fields: [
      { key: "name", kind: "name", section: "identity", label: "Qual é o seu nome?", description: null, placeholder: null, required: true, active: true, position: 0, validation: {}, settings: {}, options: [] },
      { key: "email", kind: "email", section: "identity", label: "Qual é o seu melhor e-mail?", description: null, placeholder: null, required: true, active: true, position: 1, validation: {}, settings: {}, options: [] },
      { key: "phone", kind: "phone", section: "identity", label: "Qual é o seu WhatsApp?", description: null, placeholder: null, required: true, active: true, position: 2, validation: {}, settings: {}, options: [] },
    ],
    ranges:
      mode === "scoring"
        ? [
            { name: "Frio", slug: "cold", minScore: 0, maxScore: 39, visualToken: "cold", position: 0 },
            { name: "Morno", slug: "warm", minScore: 40, maxScore: 59, visualToken: "warm", position: 1 },
            { name: "Quente", slug: "hot", minScore: 60, maxScore: 100, visualToken: "hot", position: 2 },
          ]
        : [],
    rules: [],
    appearance: {
      presetKey: "focus",
      tokens: { primary: "#00D084", secondary: "#0B1220", background: "#FFFFFF", text: "#171717", radius: "medium" },
      assets: {},
      copy: {
        formMode: mode,
        title: name,
        subtitle: mode === "direct" ? "Preencha seus dados para falar com nossa equipe." : "Responda às perguntas para continuar.",
        submitLabel: "Enviar",
        consentText: "Autorizo o uso dos meus dados para contato e atendimento desta solicitação.",
      },
    },
    completionPages: [
      { key: "success", title: "Obrigado!", description: "Recebemos suas informações e entraremos em contato em breve.", buttonLabel: null, actionType: "none", actionTarget: null },
    ],
  };
}

// ---------------------------------------------------------------------------

export const listForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgInput.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const { db, organizationId } = await orgContext(context.userId, data.organizationId);
    const [{ data: forms }, { data: subs }] = await Promise.all([
      db
        .from("lead_forms")
        .select("id, public_id, name, slug, mode, status, active_version_id, created_at, updated_at, pipeline_id, stage_id")
        .eq("organization_id", organizationId)
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      db
        .from("lead_form_submissions")
        .select("form_id, created_at")
        .eq("organization_id", organizationId)
        .limit(10000),
    ]);
    const rows = (forms ?? []) as any[];
    const all = (subs ?? []) as { form_id: string; created_at: string }[];
    const since = Date.now() - 30 * 86400000;
    return {
      forms: rows.map((f) => {
        const mine = all.filter((s) => s.form_id === f.id);
        return {
          ...f,
          leads: mine.length,
          leads30d: mine.filter((s) => new Date(s.created_at).getTime() >= since).length,
        };
      }),
      stats: {
        totalForms: rows.length,
        activeForms: rows.filter((f) => f.status === "active").length,
        totalLeads: all.length,
      },
    };
  });

export const createForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    orgInput
      .extend({ name: z.string().trim().min(1).max(120), mode: formModeSchema.default("scoring") })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { db, organizationId } = await orgContext(context.userId, data.organizationId);
    const draft = starterDraft(data.name, data.mode);
    const slug = await uniqueSlug(db, organizationId, draft.slug);
    // Destino padrão: primeira etapa aberta do primeiro pipeline da empresa.
    const pipelines = await loadPipelines(db, organizationId);
    const first = pipelines[0];
    const { data: form, error } = await db
      .from("lead_forms")
      .insert({
        organization_id: organizationId,
        owner_id: context.userId,
        name: data.name,
        slug,
        mode: data.mode,
        draft: toJson({ ...draft, slug }),
        pipeline_id: first?.id ?? null,
        stage_id: first?.stages[0]?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !form) throw new Error(error?.message ?? "Não foi possível criar o formulário.");
    return { formId: form.id as string };
  });

export const getFormDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ formId: uuid }).parse(input))
  .handler(async ({ context, data }) => {
    const { db, organizationId, form } = await formContext(context.userId, data.formId);
    const [publishedVersion, pipelines] = await Promise.all([
      form.active_version_id
        ? db
            .from("lead_form_versions")
            .select("version, definition")
            .eq("id", form.active_version_id)
            .maybeSingle()
            .then((r: any) => r.data)
        : Promise.resolve(null),
      loadPipelines(db, organizationId),
    ]);
    return {
      form: {
        id: form.id as string,
        organization_id: form.organization_id as string,
        public_id: form.public_id as string,
        name: form.name as string,
        slug: form.slug as string,
        mode: form.mode as FormDraft["mode"],
        status: form.status as string,
        active_version_id: (form.active_version_id as string | null) ?? null,
        pipeline_id: (form.pipeline_id as string | null) ?? null,
        stage_id: (form.stage_id as string | null) ?? null,
        default_source: (form.default_source as string | null) ?? null,
      },
      // JSON puro; o editor reaplica o tipo FormDraft ao carregar.
      draft: (form.draft ?? {}) as Json,
      publishedVersion: publishedVersion as { version: number; definition: Json } | null,
      pipelines,
    };
  });

function draftErrors(data: FormDraft, forPublish: boolean) {
  if (data.mode !== "scoring") return [];
  const errors = [...validateScoreRanges(data.ranges), ...validateScoringQuestions(data.fields)];
  if (forPublish && data.ranges.length > 0) {
    errors.push(...validateScoreRangeCoverage(data.ranges, calculatePossibleScoreRange(data.fields)));
  }
  return errors;
}

async function persistDraft(db: Db, organizationId: string, payload: z.infer<typeof editorPayloadSchema>) {
  const { destination, formId, ...draft } = payload;
  const slugTaken = await db
    .from("lead_forms")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("slug", draft.slug)
    .neq("id", formId)
    .maybeSingle();
  if (slugTaken.data) throw new Error("Já existe outro formulário com este endereço (slug).");
  const dest = await checkDestination(db, organizationId, destination);
  const { error } = await db
    .from("lead_forms")
    .update({
      name: draft.name,
      slug: draft.slug,
      mode: draft.mode,
      draft: toJson({ ...draft, appearance: { ...draft.appearance, copy: { ...draft.appearance.copy, formMode: draft.mode } } }),
      ...dest,
    })
    .eq("id", formId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
}

export const saveFormDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => editorPayloadSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { db, organizationId } = await formContext(context.userId, data.formId);
    const errors = draftErrors(data, false);
    if (errors.length) throw new Error(errors.join(" "));
    await persistDraft(db, organizationId, data);
    return { ok: true as const };
  });

export const publishForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => editorPayloadSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { db, organizationId, form } = await formContext(context.userId, data.formId);
    const errors = draftErrors(data, true);
    if (errors.length) throw new Error(errors.join(" "));
    if (!data.fields.some((f) => f.active !== false && ["name", "email", "phone"].includes(f.kind))) {
      throw new Error("Inclua ao menos um campo de Nome, E-mail ou Telefone para identificar o lead.");
    }
    const { count } = await db
      .from("lead_forms")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .neq("id", form.id);
    if ((count ?? 0) >= MAX_ACTIVE_FORMS) {
      throw new Error(`Limite de ${MAX_ACTIVE_FORMS} formulários ativos atingido. Desative um para publicar outro.`);
    }
    await persistDraft(db, organizationId, data);
    const { data: last } = await db
      .from("lead_form_versions")
      .select("version")
      .eq("form_id", form.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { formId: _f, destination: _d, ...draft } = data;
    const { data: version, error } = await db
      .from("lead_form_versions")
      .insert({
        organization_id: organizationId,
        form_id: form.id,
        version: ((last?.version as number | undefined) ?? 0) + 1,
        definition: toJson(compileDefinition({ ...draft, formId: form.id })),
        published_by: context.userId,
      })
      .select("id, version")
      .single();
    if (error || !version) throw new Error(error?.message ?? "Não foi possível publicar.");
    const { error: updateError } = await db
      .from("lead_forms")
      .update({ status: "active", active_version_id: version.id })
      .eq("id", form.id)
      .eq("organization_id", organizationId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true as const, version: version.version as number, publicPath: `/f/${form.public_id}-${data.slug}` };
  });

export const setFormStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ formId: uuid, status: z.enum(["active", "inactive"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { db, organizationId, form } = await formContext(context.userId, data.formId);
    if (data.status === "active" && !form.active_version_id) throw new Error("Publique o formulário antes de ativá-lo.");
    const { error } = await db
      .from("lead_forms")
      .update({ status: data.status })
      .eq("id", data.formId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const duplicateForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ formId: uuid }).parse(input))
  .handler(async ({ context, data }) => {
    const { db, organizationId, form } = await formContext(context.userId, data.formId);
    const slug = await uniqueSlug(db, organizationId, `${form.slug}-copia`);
    const name = `${form.name} — cópia`.slice(0, 120);
    const { data: copy, error } = await db
      .from("lead_forms")
      .insert({
        organization_id: organizationId,
        owner_id: context.userId,
        name,
        slug,
        mode: form.mode,
        draft: toJson({ ...(form.draft ?? {}), name, slug }),
        pipeline_id: form.pipeline_id,
        stage_id: form.stage_id,
        default_source: form.default_source,
      })
      .select("id")
      .single();
    if (error || !copy) throw new Error(error?.message ?? "Não foi possível duplicar.");
    return { formId: copy.id as string };
  });

/** Exclui o formulário; se já recebeu leads, apenas arquiva (os leads continuam no CRM). */
export const deleteForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ formId: uuid }).parse(input))
  .handler(async ({ context, data }) => {
    const { db, organizationId } = await formContext(context.userId, data.formId);
    const { count } = await db
      .from("lead_form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_id", data.formId);
    if ((count ?? 0) > 0) {
      const { error } = await db
        .from("lead_forms")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", data.formId)
        .eq("organization_id", organizationId);
      if (error) throw new Error(error.message);
      return { archived: true as const };
    }
    const { error } = await db.from("lead_forms").delete().eq("id", data.formId).eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    return { archived: false as const };
  });
