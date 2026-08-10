import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const payloadSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(60).optional().nullable(),
  source: z.string().max(120).optional().nullable(),
  value: z.coerce.number().nonnegative().optional().nullable(),
  utm_source: z.string().max(200).optional().nullable(),
  utm_medium: z.string().max(200).optional().nullable(),
  utm_campaign: z.string().max(200).optional().nullable(),
  utm_term: z.string().max(200).optional().nullable(),
  utm_content: z.string().max(200).optional().nullable(),
  gclid: z.string().max(200).optional().nullable(),
  fbclid: z.string().max(200).optional().nullable(),
  landing_url: z.string().max(600).optional().nullable(),
  referrer: z.string().max(600).optional().nullable(),
});

export const Route = createFileRoute("/api/public/leads/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const token = params.token;
        if (!token || token.length < 10) {
          return new Response("Invalid token", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: hook } = await supabaseAdmin
          .from("lead_webhooks")
          .select("id, owner_id, active, direction, default_stage_id, call_count")
          .eq("token", token)
          .maybeSingle();

        if (!hook || !hook.active || hook.direction !== "inbound") {
          return new Response("Webhook not found", { status: 404 });
        }

        // aceita JSON, form-urlencoded e multipart (formulários)
        let raw: Record<string, unknown>;
        try {
          const ct = request.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            raw = (await request.json()) as Record<string, unknown>;
          } else {
            const fd = await request.formData();
            raw = Object.fromEntries(fd.entries());
          }
        } catch {
          return new Response("Invalid body", { status: 400 });
        }

        // normaliza nomes de campos comuns de formulários
        const pick = (...keys: string[]) => {
          for (const k of keys) {
            const v = raw[k];
            if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
          }
          return undefined;
        };
        const body = {
          name: pick("name", "nome", "full_name", "fullname", "nome_completo", "Nome"),
          email: pick("email", "e-mail", "e_mail", "mail", "Email"),
          phone: pick("phone", "telefone", "celular", "whatsapp", "Telefone"),
          company: pick("company", "empresa"),
          city: pick("city", "cidade"),
          state: pick("state", "estado", "uf"),
          source: pick("source", "origem") ?? "webhook",
          value: pick("value", "valor"),
          utm_source: pick("utm_source"),
          utm_medium: pick("utm_medium"),
          utm_campaign: pick("utm_campaign"),
          utm_term: pick("utm_term"),
          utm_content: pick("utm_content"),
          gclid: pick("gclid"),
          fbclid: pick("fbclid"),
          landing_url: pick("landing_url", "page_url", "url"),
          referrer: pick("referrer", "referer"),
        };

        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 422 });
        }


        let stageId = hook.default_stage_id;
        if (!stageId) {
          const { data: firstStage } = await supabaseAdmin
            .from("pipeline_stages")
            .select("id")
            .eq("owner_id", hook.owner_id)
            .order("position")
            .limit(1)
            .maybeSingle();
          stageId = firstStage?.id ?? null;
        }

        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({ ...parsed.data, owner_id: hook.owner_id, stage_id: stageId })
          .select("id")
          .single();

        if (error) {
          console.error("lead webhook insert failed", error.message);
          return Response.json({ error: error.message }, { status: 500 });
        }

        await supabaseAdmin
          .from("lead_webhooks")
          .update({ call_count: (hook.call_count ?? 0) + 1, last_called_at: new Date().toISOString() })
          .eq("id", hook.id);

        return Response.json({ ok: true, lead_id: lead.id }, { status: 201 });
      },
    },
  },
});
