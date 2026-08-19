import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export const QUESTION_TYPES = [
  "single_choice",
  "multi_choice",
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "date",
  "rating",
  "consent",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export type EditorOption = {
  id: string | null;
  label: string;
  value: string | null;
  score: number;
};

export type EditorQuestion = {
  id: string | null;
  question: string;
  help_text: string | null;
  question_type: QuestionType;
  required: boolean;
  lead_field: string | null;
  options: EditorOption[];
};

/** Perguntas + opções de um formulário, ordenadas. */
export const listFormQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ form_id: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<EditorQuestion[]> => {
    const { supabase, userId } = context;
    const [{ data: questions, error }, { data: options }] = await Promise.all([
      supabase
        .from("form_questions")
        .select("id, question, help_text, question_type, required, lead_field, order_index")
        .eq("form_id", data.form_id)
        .eq("owner_id", userId)
        .order("order_index"),
      supabase
        .from("form_options")
        .select("id, question_id, label, value, score, order_index")
        .eq("form_id", data.form_id)
        .eq("owner_id", userId)
        .order("order_index"),
    ]);
    if (error) throw new Error(error.message);

    return (questions ?? []).map((q) => ({
      id: q.id,
      question: q.question,
      help_text: q.help_text,
      question_type: q.question_type as QuestionType,
      required: q.required,
      lead_field: q.lead_field,
      options: (options ?? [])
        .filter((o) => o.question_id === q.id)
        .map((o) => ({
          id: o.id,
          label: o.label,
          value: o.value,
          score: o.score ?? 0,
        })),
    }));
  });

const optionSchema = z.object({
  id: uuid.nullable().optional(),
  label: z.string().trim().min(1).max(160),
  value: z.string().trim().max(160).nullable().optional(),
  score: z.number().int().min(-100).max(1000).default(0),
});

const questionSchema = z.object({
  id: uuid.nullable().optional(),
  question: z.string().trim().min(1).max(300),
  help_text: z.string().trim().max(500).nullable().optional(),
  question_type: z.enum(QUESTION_TYPES),
  required: z.boolean().default(false),
  lead_field: z.string().trim().max(40).nullable().optional(),
  options: z.array(optionSchema).max(30).default([]),
});

const CHOICE_TYPES: QuestionType[] = ["single_choice", "multi_choice"];

/** Salva todas as perguntas do formulário: ordena, cria, atualiza e remove o que saiu. */
export const saveFormQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ form_id: uuid, questions: z.array(questionSchema).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: form, error: formErr } = await supabase
      .from("forms")
      .select("id")
      .eq("id", data.form_id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (formErr) throw new Error(formErr.message);
    if (!form) throw new Error("Formulário não encontrado");

    const keepQuestionIds: string[] = [];
    const keepOptionIds: string[] = [];

    for (let i = 0; i < data.questions.length; i++) {
      const q = data.questions[i]!;
      const payload = {
        question: q.question,
        help_text: q.help_text ?? null,
        question_type: q.question_type,
        required: q.required,
        lead_field: q.lead_field || null,
        order_index: i,
      };

      let questionId = q.id ?? null;
      if (questionId) {
        const { error } = await supabase
          .from("form_questions")
          .update(payload)
          .eq("id", questionId)
          .eq("owner_id", userId);
        if (error) throw new Error(error.message);
      } else {
        const { data: row, error } = await supabase
          .from("form_questions")
          .insert({ ...payload, form_id: data.form_id, owner_id: userId })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        questionId = row.id;
      }
      keepQuestionIds.push(questionId!);

      const options = CHOICE_TYPES.includes(q.question_type) ? q.options : [];
      for (let j = 0; j < options.length; j++) {
        const o = options[j]!;
        const optPayload = {
          label: o.label,
          value: o.value || null,
          score: o.score ?? 0,
          order_index: j,
        };
        if (o.id) {
          const { error } = await supabase
            .from("form_options")
            .update(optPayload)
            .eq("id", o.id)
            .eq("owner_id", userId);
          if (error) throw new Error(error.message);
          keepOptionIds.push(o.id);
        } else {
          const { data: row, error } = await supabase
            .from("form_options")
            .insert({
              ...optPayload,
              form_id: data.form_id,
              question_id: questionId!,
              owner_id: userId,
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          keepOptionIds.push(row.id);
        }
      }
    }

    // remove opções e perguntas que saíram do editor
    let delOptions = supabase
      .from("form_options")
      .delete()
      .eq("form_id", data.form_id)
      .eq("owner_id", userId);
    if (keepOptionIds.length) delOptions = delOptions.not("id", "in", `(${keepOptionIds.join(",")})`);
    const { error: optDelErr } = await delOptions;
    if (optDelErr) throw new Error(optDelErr.message);

    let delQuestions = supabase
      .from("form_questions")
      .delete()
      .eq("form_id", data.form_id)
      .eq("owner_id", userId);
    if (keepQuestionIds.length)
      delQuestions = delQuestions.not("id", "in", `(${keepQuestionIds.join(",")})`);
    const { error: qDelErr } = await delQuestions;
    if (qDelErr) throw new Error(qDelErr.message);

    return { ok: true as const, count: keepQuestionIds.length };
  });
