import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appearanceSchema,
  completionPageSchema,
  formFieldSchema,
  formModeSchema,
  ruleSchema,
  scoreRangeSchema,
} from "./domain";
import type { Json } from "@/integrations/supabase/types";
import { calculateConfiguredScore, evaluateRules } from "./rules-engine";

/**
 * Formulário público (/f/{publicId}-{slug}). O envio cria o lead direto no
 * pipeline da empresa dona do formulário, já com pontuação e classificação.
 */

type Db = { from: (t: string) => any };

const definitionSchema = z.object({
  schemaVersion: z.number(),
  mode: formModeSchema.default("scoring"),
  name: z.string(),
  slug: z.string(),
  fields: z.array(formFieldSchema),
  scoreRanges: z.array(scoreRangeSchema),
  rules: z.array(ruleSchema),
  appearance: appearanceSchema,
  completionPages: z.array(completionPageSchema),
});
export type Definition = z.infer<typeof definitionSchema>;
/** Formato que a página pública usa (o servidor devolve a definição como JSON). */
export type PublicFormData = { formId: string; versionId: string; version: number; definition: Definition };
type Range = z.infer<typeof scoreRangeSchema>;

const publicSlugSchema = z.object({ publicSlug: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(180) });

function publicIdFromSlug(publicSlug: string) {
  return /^([A-Za-z0-9]+)(?:-|$)/.exec(publicSlug)?.[1] ?? publicSlug;
}

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

async function clientHash() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const raw = `${ip}|${request.headers.get("user-agent") ?? ""}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8;

async function enforceRateLimit(db: Db, formId: string, hash: string) {
  const { count } = await db
    .from("lead_form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("form_id", formId)
    .eq("client_hash", hash)
    .gte("created_at", new Date(Date.now() - RATE_WINDOW_MS).toISOString());
  if ((count ?? 0) >= RATE_MAX) {
    throw new Error("Muitos envios em sequência. Aguarde alguns minutos e tente novamente.");
  }
}

function closestRange(ranges: Range[], score: number) {
  if (ranges.length === 0) return undefined;
  const exact = ranges.find((r) => score >= r.minScore && score <= r.maxScore);
  if (exact) return exact;
  const sorted = [...ranges].sort((a, b) => a.minScore - b.minScore);
  const first = sorted[0]!;
  const last = sorted.reduce((cur, r) => (r.maxScore > cur.maxScore ? r : cur));
  if (score < first.minScore) return first;
  if (score > last.maxScore) return last;
  const dist = (r: Range) => (score < r.minScore ? r.minScore - score : score > r.maxScore ? score - r.maxScore : 0);
  return sorted.reduce((best, r) => (dist(r) < dist(best) ? r : best), first);
}

/** Classificação gravada no lead: palavra-chave de cor (hot/warm/cold) ou o nome da faixa. */
function leadClassification(definition: Definition, key: string | null) {
  if (!key) return { value: null as string | null, label: null as string | null };
  const range = definition.scoreRanges.find((r) => r.slug === key);
  if (!range) return { value: key, label: key };
  const tone = range.visualToken === "success" ? "hot" : range.visualToken;
  return { value: ["hot", "warm", "cold"].includes(tone) ? tone : range.name, label: range.name };
}

/** Respostas legíveis (rótulo da pergunta → texto da alternativa) para a ficha do lead. */
function readableAnswers(definition: Definition, answers: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const field of definition.fields) {
    const value = answers[field.key];
    if (value == null || value === "") continue;
    const label = (field.label || field.key).replace(/<[^>]+>/g, "").slice(0, 160);
    const optionLabel = (v: unknown) => field.options.find((o) => o.value === v)?.label ?? String(v);
    if (Array.isArray(value)) out[label] = value.map(optionLabel).join(", ");
    else if (field.kind === "boolean") out[label] = value === true || value === "true" ? "Sim" : value === false || value === "false" ? "Não" : optionLabel(value);
    else if (field.options.length) out[label] = optionLabel(value);
    else out[label] = String(value);
  }
  return out;
}

async function loadActiveForm(db: Db, publicSlug: string) {
  const publicId = publicIdFromSlug(publicSlug);
  const { data: form } = await db
    .from("lead_forms")
    .select("id, public_id, name, slug, status, organization_id, owner_id, active_version_id, pipeline_id, stage_id, default_source")
    .eq("public_id", publicId)
    .eq("status", "active")
    .maybeSingle();
  return form as any;
}

// POST evita que o navegador/CDN reaproveite uma definição antiga após publicar.
export const getPublicForm = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publicSlugSchema.parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const form = await loadActiveForm(db, data.publicSlug);
    if (!form?.active_version_id) throw new Error("Este formulário não está disponível.");
    const { data: version } = await db
      .from("lead_form_versions")
      .select("id, version, definition")
      .eq("id", form.active_version_id)
      .eq("form_id", form.id)
      .maybeSingle();
    if (!version) throw new Error("Versão publicada não encontrada.");
    const definition = definitionSchema.parse(version.definition);
    return {
      formId: form.id as string,
      versionId: version.id as string,
      version: version.version as number,
      // JSON puro: o tipo é reaplicado na página (PublicFormData).
      definition: JSON.parse(JSON.stringify(definition)) as Json,
    };
  });

const campaignSchema = z.object({
  utm_source: z.string().max(255).optional(),
  utm_medium: z.string().max(255).optional(),
  utm_campaign: z.string().max(255).optional(),
  utm_term: z.string().max(255).optional(),
  utm_content: z.string().max(255).optional(),
  gclid: z.string().max(255).optional(),
  fbclid: z.string().max(255).optional(),
});

const originSchema = z.object({
  page: z.string().max(255).optional(),
  landing_url: z.string().max(600).optional(),
  referrer: z.string().max(600).optional(),
});

const submitSchema = z.object({
  publicSlug: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(180),
  versionId: z.string().uuid(),
  answers: z.record(z.string(), z.unknown()),
  utm: campaignSchema.default({}),
  origin: originSchema.default({}),
  consent: z.object({ accepted: z.literal(true), acceptedAt: z.string().datetime() }),
  idempotencyKey: z.string().uuid(),
  companyWebsite: z.string().max(200).optional(),
});

/** Etapa onde o lead entra: a do formulário, ou a primeira aberta do pipeline / da empresa. */
async function resolveStage(db: Db, form: any): Promise<string | null> {
  if (form.stage_id) {
    const { data: s } = await db
      .from("pipeline_stages")
      .select("id")
      .eq("id", form.stage_id)
      .eq("organization_id", form.organization_id)
      .maybeSingle();
    if (s) return s.id as string;
  }
  let pipelineId: string | null = form.pipeline_id ?? null;
  if (!pipelineId) {
    const { data: p } = await db
      .from("pipelines")
      .select("id")
      .eq("organization_id", form.organization_id)
      .order("position")
      .limit(1)
      .maybeSingle();
    pipelineId = (p?.id as string | undefined) ?? null;
  }
  if (!pipelineId) return null;
  const { data: stage } = await db
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .eq("organization_id", form.organization_id)
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position")
    .limit(1)
    .maybeSingle();
  return (stage?.id as string | undefined) ?? null;
}

export const submitPublicForm = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data }) => {
    // Campo invisível (honeypot): robôs preenchem, pessoas não.
    if (data.companyWebsite && data.companyWebsite.trim().length > 0) {
      throw new Error("Não foi possível registrar suas respostas.");
    }
    const db = await admin();
    const form = await loadActiveForm(db, data.publicSlug);
    if (!form || form.active_version_id !== data.versionId) {
      throw new Error("O formulário foi atualizado. Recarregue a página para continuar.");
    }

    // Reenvio do mesmo envio (duplo clique, rede instável): devolve o resultado anterior.
    const { data: existing } = await db
      .from("lead_form_submissions")
      .select("id, classification_key, score_total, evaluation")
      .eq("form_id", form.id)
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existing) {
      const ev = (existing.evaluation ?? {}) as Record<string, unknown>;
      return {
        token: existing.id as string,
        classification: (existing.classification_key as string | null) ?? null,
        score: Number(existing.score_total ?? 0),
        completionPageKey: (ev["completionPageKey"] as string) ?? "success",
        redirect: (ev["redirect"] as string | null) ?? null,
        message: (ev["message"] as string | null) ?? null,
      };
    }

    const hash = await clientHash();
    await enforceRateLimit(db, form.id, hash);

    const { data: version } = await db
      .from("lead_form_versions")
      .select("definition, version")
      .eq("id", data.versionId)
      .eq("form_id", form.id)
      .maybeSingle();
    if (!version) throw new Error("Formulário indisponível.");
    const definition = definitionSchema.parse(version.definition);
    const preliminary = evaluateRules(definition.rules, { answers: data.answers });

    // Validação no servidor: nunca confia no que veio do navegador.
    const clean: Record<string, unknown> = {};
    for (const field of definition.fields) {
      const value = data.answers[field.key];
      const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
      const skipped = (preliminary.terminated || preliminary.selectedCompletionPage) && field.section === "qualification";
      if (field.required && empty && !skipped) throw new Error(`Responda: ${field.label.replace(/<[^>]+>/g, "")}`);
      if (empty) continue;
      const normalized = typeof value === "string" ? value.trim() : value;
      if (field.kind === "email" && !z.string().email().safeParse(typeof normalized === "string" ? normalized.toLowerCase() : normalized).success) throw new Error(`${field.label}: informe um e-mail válido.`);
      if (field.kind === "number" && !Number.isFinite(Number(normalized))) throw new Error(`${field.label}: informe um número válido.`);
      if (field.kind === "single_choice" && !field.options.some((o) => o.value === normalized)) throw new Error(`${field.label}: opção inválida.`);
      if (field.kind === "multi_choice" && (!Array.isArray(normalized) || normalized.some((item) => !field.options.some((o) => o.value === item)))) throw new Error(`${field.label}: opção inválida.`);
      clean[field.key] = typeof normalized === "string" ? (field.kind === "email" ? normalized.toLowerCase() : normalized).slice(0, 2000) : normalized;
    }

    const usesScoring = definition.mode === "scoring";
    const scoring = usesScoring
      ? calculateConfiguredScore(definition.fields, clean)
      : { total: 0, breakdown: [] as { fieldKey: string; optionValue: string; points: number }[] };
    const range = usesScoring ? closestRange(definition.scoreRanges, scoring.total) : undefined;
    const rules = usesScoring
      ? evaluateRules(definition.rules, { answers: clean, score: scoring.total, classification: range?.slug })
      : evaluateRules([], { answers: clean });
    const classificationKey = usesScoring ? rules.classification ?? range?.slug ?? null : null;
    const classification = leadClassification(definition, classificationKey);
    const completionPageKey = rules.completionPageKey ?? "success";
    const state = rules.terminated ? "terminated" : "completed";

    const identity = (kind: string) => {
      const field = definition.fields.find((item) => item.kind === kind);
      const answer = field ? clean[field.key] : null;
      return typeof answer === "string" && answer ? answer : null;
    };
    const name = identity("name") ?? identity("email") ?? identity("phone") ?? `Lead — ${form.name}`;
    const respostas = readableAnswers(definition, clean);

    // 1) Lead no pipeline da empresa (contato repetido vira card novo com alerta de duplicata)
    const stageId = await resolveStage(db, form);
    const { findDuplicate, duplicateMark } = await import("@/lib/pipeline/duplicates.server");
    const dup = await findDuplicate(db, form.organization_id, identity("email"), identity("phone")).catch(
      () => null,
    );
    const dupMark = dup ? duplicateMark(dup) : null;
    const { data: lead, error: leadError } = await db
      .from("leads")
      .insert({
        organization_id: form.organization_id,
        owner_id: form.owner_id,
        stage_id: stageId,
        name: name.slice(0, 200),
        email: identity("email"),
        phone: identity("phone")?.slice(0, 60) ?? null,
        city: identity("city")?.slice(0, 120) ?? null,
        state: identity("state")?.slice(0, 60) ?? null,
        source: (form.default_source as string | null) || `Formulário — ${form.name}`,
        utm_source: data.utm.utm_source ?? null,
        utm_medium: data.utm.utm_medium ?? null,
        utm_campaign: data.utm.utm_campaign ?? null,
        utm_term: data.utm.utm_term ?? null,
        utm_content: data.utm.utm_content ?? null,
        gclid: data.utm.gclid ?? null,
        fbclid: data.utm.fbclid ?? null,
        landing_url: data.origin.landing_url ?? null,
        referrer: data.origin.referrer ?? null,
        lead_score: usesScoring ? scoring.total : null,
        lead_classification: classification.value,
        metadata: {
          origem: "formulario",
          form: { id: form.id, name: form.name, version: version.version },
          classificacao: classification.label,
          tags_formulario: rules.tags,
          respostas,
          ...(dupMark ?? {}),
        },
      })
      .select("id")
      .single();
    if (leadError || !lead) {
      console.error("[forms] falha ao criar lead", leadError?.message);
      throw new Error("Não foi possível registrar suas respostas. Tente novamente.");
    }

    // 2) Registro da resposta (histórico do formulário)
    const evaluation = {
      score: scoring,
      range: range ?? null,
      completionPageKey,
      redirect: rules.redirect ?? null,
      message: rules.message ?? null,
      tags: rules.tags,
    };
    const { data: submission, error: subError } = await db
      .from("lead_form_submissions")
      .insert({
        organization_id: form.organization_id,
        form_id: form.id,
        version_id: data.versionId,
        lead_id: lead.id,
        state,
        answers: JSON.parse(JSON.stringify(clean)),
        score_total: usesScoring ? scoring.total : null,
        classification_key: classificationKey,
        classification_label: classification.label,
        tags: rules.tags,
        utm: data.utm,
        origin: data.origin,
        consent: data.consent,
        evaluation: JSON.parse(JSON.stringify(evaluation)),
        client_hash: hash,
        idempotency_key: data.idempotencyKey,
      })
      .select("id")
      .single();
    if (subError) console.error("[forms] falha ao registrar resposta", subError.message);

    // 3) Jornada do lead (o "Lead criado" já é gravado por gatilho no banco)
    await db.from("lead_events").insert({
      lead_id: lead.id,
      owner_id: form.owner_id,
      actor_id: null,
      kind: "form_submitted",
      title: `Formulário "${form.name}" respondido`,
      description: classification.label
        ? `Classificação: ${classification.label}${usesScoring ? ` · ${scoring.total} pontos` : ""}`
        : null,
      meta: { form_id: form.id, submission_id: submission?.id ?? null },
      ...(form.organization_id ? { organization_id: form.organization_id } : {}),
    });

    return {
      token: (submission?.id as string | undefined) ?? (lead.id as string),
      classification: classificationKey,
      score: scoring.total,
      completionPageKey,
      redirect: rules.redirect ?? null,
      message: rules.message ?? null,
    };
  });
