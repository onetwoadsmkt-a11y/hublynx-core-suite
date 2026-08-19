import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export type FormStatus = "rascunho" | "publicado" | "pausado";

export type FormListItem = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  status: FormStatus;
  pipeline_id: string | null;
  pipeline_name: string | null;
  pipeline_stage_id: string | null;
  stage_name: string | null;
  responses: number;
  created_at: string;
  last_response_at: string | null;
};

function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "formulario"
  );
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 7);
}

/** Lista os formulários da empresa, com pipeline, etapa e contagem de respostas. */
export const listForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FormListItem[]> => {
    const { supabase, userId } = context;
    const { data: forms, error } = await supabase
      .from("forms")
      .select(
        "id, name, description, slug, status, pipeline_id, pipeline_stage_id, created_at",
      )
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = forms ?? [];
    if (!rows.length) return [];

    const [{ data: pipelines }, { data: stages }, { data: subs }] = await Promise.all([
      supabase.from("pipelines").select("id, name").eq("owner_id", userId),
      supabase.from("pipeline_stages").select("id, name").eq("owner_id", userId),
      supabase
        .from("form_submissions")
        .select("form_id, started_at")
        .eq("owner_id", userId),
    ]);
    const pMap = new Map((pipelines ?? []).map((p) => [p.id, p.name]));
    const sMap = new Map((stages ?? []).map((s) => [s.id, s.name]));
    const count = new Map<string, number>();
    const last = new Map<string, string>();
    for (const s of subs ?? []) {
      count.set(s.form_id, (count.get(s.form_id) ?? 0) + 1);
      const cur = last.get(s.form_id);
      if (!cur || s.started_at > cur) last.set(s.form_id, s.started_at);
    }

    return rows.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      slug: f.slug,
      status: f.status as FormStatus,
      pipeline_id: f.pipeline_id,
      pipeline_name: f.pipeline_id ? (pMap.get(f.pipeline_id) ?? null) : null,
      pipeline_stage_id: f.pipeline_stage_id,
      stage_name: f.pipeline_stage_id ? (sMap.get(f.pipeline_stage_id) ?? null) : null,
      responses: count.get(f.id) ?? 0,
      created_at: f.created_at,
      last_response_at: last.get(f.id) ?? null,
    }));
  });

const formInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  pipeline_id: uuid.nullable().optional(),
  pipeline_stage_id: uuid.nullable().optional(),
});

/** Cria ou atualiza um formulário. Slug é gerado uma vez e nunca muda. */
export const upsertForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => formInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      name: data.name,
      description: data.description ?? null,
      pipeline_id: data.pipeline_id ?? null,
      pipeline_stage_id: data.pipeline_stage_id ?? null,
    };

    if (data.id) {
      const { data: row, error } = await supabase
        .from("forms")
        .update(payload)
        .eq("id", data.id)
        .eq("owner_id", userId)
        .select("id, slug")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }

    const base = slugify(data.name);
    for (let attempt = 0; attempt < 6; attempt++) {
      const slug = `${base}-${randomSuffix()}`;
      const { data: row, error } = await supabase
        .from("forms")
        .insert({ ...payload, owner_id: userId, created_by: userId, slug })
        .select("id, slug")
        .single();
      if (!error) return row;
      if (!/duplicate key|unique/i.test(error.message)) throw new Error(error.message);
    }
    throw new Error("Não foi possível gerar um link único para o formulário.");
  });

/** Publica, pausa ou volta o formulário para rascunho. */
export const setFormStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, status: z.enum(["rascunho", "publicado", "pausado"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("forms")
      .update({
        status: data.status,
        ...(data.status === "publicado" ? { published_at: new Date().toISOString() } : {}),
      })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Duplica o formulário (perguntas e opções incluídas), sempre como rascunho. */
export const duplicateForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: src, error } = await supabase
      .from("forms")
      .select("*")
      .eq("id", data.id)
      .eq("owner_id", userId)
      .single();
    if (error || !src) throw new Error(error?.message ?? "Formulário não encontrado");

    const base = slugify(`${src.name} copia`);
    const { data: copy, error: insErr } = await supabase
      .from("forms")
      .insert({
        owner_id: userId,
        created_by: userId,
        name: `${src.name} (cópia)`,
        description: src.description,
        slug: `${base}-${randomSuffix()}`,
        status: "rascunho",
        pipeline_id: src.pipeline_id,
        pipeline_stage_id: src.pipeline_stage_id,
        default_source: src.default_source,
        theme: src.theme,
        intro_message: src.intro_message,
        success_message: src.success_message,
        settings: src.settings,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const { data: questions } = await supabase
      .from("form_questions")
      .select("*")
      .eq("form_id", src.id)
      .order("order_index");
    const idMap = new Map<string, string>();
    for (const q of questions ?? []) {
      const { data: nq } = await supabase
        .from("form_questions")
        .insert({
          form_id: copy.id,
          owner_id: userId,
          question: q.question,
          help_text: q.help_text,
          question_type: q.question_type,
          order_index: q.order_index,
          required: q.required,
          lead_field: q.lead_field,
          settings: q.settings,
        })
        .select("id")
        .single();
      if (nq) idMap.set(q.id, nq.id);
    }
    const { data: options } = await supabase
      .from("form_options")
      .select("*")
      .eq("form_id", src.id)
      .order("order_index");
    const rows = (options ?? [])
      .filter((o) => idMap.has(o.question_id))
      .map((o) => ({
        form_id: copy.id,
        owner_id: userId,
        question_id: idMap.get(o.question_id)!,
        label: o.label,
        value: o.value,
        order_index: o.order_index,
        score: o.score,
        next_question_id: o.next_question_id ? (idMap.get(o.next_question_id) ?? null) : null,
      }));
    if (rows.length) await supabase.from("form_options").insert(rows);
    return { id: copy.id };
  });

export const deleteForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("forms")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
