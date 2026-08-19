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
