import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Payload público — apenas o necessário para preencher. Nada interno do CRM. */
export type PublicForm = {
  name: string;
  slug: string;
  intro_message: string | null;
  success_message: string | null;
  theme: Record<string, string | number | boolean | null>;
  questions: {
    id: string;
    question: string;
    help_text: string | null;
    question_type: string;
    required: boolean;
    order_index: number;
    options: { id: string; label: string; value: string | null; order_index: number }[];
  }[];
} | null;

/** Leitura pública (sem login) de um formulário publicado, pelo slug. */
export const getPublicForm = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ slug: z.string().trim().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data }): Promise<PublicForm> => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;
    const sb = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { data: form } = await sb
      .from("forms")
      .select("id, name, slug, intro_message, success_message, theme")
      .eq("slug", data.slug)
      .eq("status", "publicado")
      .maybeSingle();
    if (!form) return null;

    const [{ data: questions }, { data: options }] = await Promise.all([
      sb
        .from("form_questions")
        .select("id, question, help_text, question_type, required, order_index")
        .eq("form_id", form.id)
        .order("order_index"),
      sb
        .from("form_options")
        .select("id, question_id, label, value, order_index")
        .eq("form_id", form.id)
        .order("order_index"),
    ]);

    return {
      name: form.name,
      slug: form.slug,
      intro_message: form.intro_message,
      success_message: form.success_message,
      theme: (form.theme ?? {}) as Record<string, string | number | boolean | null>,
      questions: (questions ?? []).map((q) => ({
        id: q.id,
        question: q.question,
        help_text: q.help_text,
        question_type: q.question_type,
        required: q.required,
        order_index: q.order_index,
        options: (options ?? [])
          .filter((o) => o.question_id === q.id)
          .map((o) => ({
            id: o.id,
            label: o.label,
            value: o.value,
            order_index: o.order_index,
          })),
      })),
    };
  });

const answerValue = z.union([z.string(), z.array(z.string()), z.boolean(), z.null()]);

/** Envio público (sem login): grava resposta, pontua e cria o lead no pipeline do formulário. */
export const submitPublicForm = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().trim().min(1).max(80),
        answers: z.record(z.string().uuid(), answerValue),
        landing_url: z.string().max(600).optional().nullable(),
        referrer: z.string().max(600).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { computeSubmission } = await import("@/lib/forms/scoring");
    const { utmFromUrl } = await import("@/lib/pipeline/lead-mapping");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: form } = await supabaseAdmin
      .from("forms")
      .select(
        "id, owner_id, name, success_message, pipeline_id, pipeline_stage_id, default_source",
      )
      .eq("slug", data.slug)
      .eq("status", "publicado")
      .maybeSingle();
    if (!form) throw new Error("Formulário não encontrado ou não publicado.");

    const [{ data: questions }, { data: options }] = await Promise.all([
      supabaseAdmin
        .from("form_questions")
        .select("id, question, question_type, required, lead_field, order_index")
        .eq("form_id", form.id)
        .order("order_index"),
      supabaseAdmin
        .from("form_options")
        .select("id, question_id, label, value, score")
        .eq("form_id", form.id),
    ]);

    const scoring = (questions ?? []).map((q) => ({
      id: q.id,
      question: q.question,
      question_type: q.question_type,
      required: q.required,
      lead_field: q.lead_field,
      options: (options ?? [])
        .filter((o) => o.question_id === q.id)
        .map((o) => ({ id: o.id, label: o.label, value: o.value, score: o.score })),
    }));

    const result = computeSubmission(scoring, data.answers);
    if (result.missing.length) {
      throw new Error(`Responda: ${result.missing.map((m) => m.question).join(", ")}`);
    }

    const utm = utmFromUrl(data.landing_url ?? undefined);
    const lead = result.lead;
    const now = new Date().toISOString();

    // etapa de destino: a configurada no formulário ou a primeira do pipeline
    let stageId = form.pipeline_stage_id;
    if (!stageId) {
      const q = supabaseAdmin
        .from("pipeline_stages")
        .select("id")
        .eq("owner_id", form.owner_id)
        .order("position")
        .limit(1);
      const { data: stages } = form.pipeline_id ? await q.eq("pipeline_id", form.pipeline_id) : await q;
      stageId = stages?.[0]?.id ?? null;
    }

    const { data: newLead } = await supabaseAdmin
      .from("leads")
      .insert({
        owner_id: form.owner_id,
        stage_id: stageId,
        name: lead["name"]?.slice(0, 200) || "Lead do formulário",
        email: lead["email"] ?? null,
        phone: lead["phone"] ?? null,
        company: lead["company"] ?? null,
        city: lead["city"] ?? null,
        state: lead["state"] ?? null,
        value: lead["value"] ? Number(lead["value"]) || null : null,
        source: lead["source"] ?? form.default_source ?? `Formulário: ${form.name}`,
        temperature: result.temperature,
        landing_url: data.landing_url ?? null,
        referrer: data.referrer ?? null,
        utm_source: lead["utm_source"] ?? utm["utm_source"] ?? null,
        utm_medium: lead["utm_medium"] ?? utm["utm_medium"] ?? null,
        utm_campaign: lead["utm_campaign"] ?? utm["utm_campaign"] ?? null,
        utm_term: lead["utm_term"] ?? utm["utm_term"] ?? null,
        utm_content: lead["utm_content"] ?? utm["utm_content"] ?? null,
        gclid: utm["gclid"] ?? null,
        fbclid: utm["fbclid"] ?? null,
        metadata: { form_id: form.id, form_score: result.score },
      })
      .select("id")
      .single();

    const { data: submission } = await supabaseAdmin
      .from("form_submissions")
      .insert({
        form_id: form.id,
        owner_id: form.owner_id,
        lead_id: newLead?.id ?? null,
        status: "concluido",
        total_score: result.score,
        temperature: result.temperature,
        source: form.default_source ?? null,
        landing_url: data.landing_url ?? null,
        referrer: data.referrer ?? null,
        utm_source: utm["utm_source"] ?? null,
        utm_medium: utm["utm_medium"] ?? null,
        utm_campaign: utm["utm_campaign"] ?? null,
        utm_term: utm["utm_term"] ?? null,
        utm_content: utm["utm_content"] ?? null,
        completed_at: now,
      })
      .select("id")
      .single();

    if (submission) {
      const rows = result.details.map((d) => ({
        submission_id: submission.id,
        question_id: d.question_id,
        option_id: d.option_id,
        owner_id: form.owner_id,
        answer: d.answer,
        score: d.score,
      }));
      if (rows.length) await supabaseAdmin.from("form_answers").insert(rows);
    }

    if (newLead) {
      await supabaseAdmin.from("lead_notes").insert({
        lead_id: newLead.id,
        owner_id: form.owner_id,
        body: [
          `Respostas do formulário "${form.name}" (score ${result.score} · ${result.temperature})`,
          ...result.details.map((d) => `• ${d.question}: ${d.answer}`),
        ].join("\n"),
      });
    }

    return {
      ok: true as const,
      score: result.score,
      temperature: result.temperature,
      message: form.success_message,
    };
  });
