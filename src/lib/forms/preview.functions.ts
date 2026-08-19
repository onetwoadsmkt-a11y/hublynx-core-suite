import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PublicForm } from "@/lib/forms/public.functions";

/** Pré-visualização (dono do formulário) — devolve o mesmo payload público, mesmo em rascunho. */
export const getFormPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ form_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<NonNullable<PublicForm>> => {
    const { supabase, userId } = context;
    const { data: form, error } = await supabase
      .from("forms")
      .select("id, name, slug, intro_message, success_message, theme")
      .eq("id", data.form_id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!form) throw new Error("Formulário não encontrado");

    const [{ data: questions }, { data: options }] = await Promise.all([
      supabase
        .from("form_questions")
        .select("id, question, help_text, question_type, required, order_index")
        .eq("form_id", form.id)
        .eq("owner_id", userId)
        .order("order_index"),
      supabase
        .from("form_options")
        .select("id, question_id, label, value, order_index")
        .eq("form_id", form.id)
        .eq("owner_id", userId)
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
