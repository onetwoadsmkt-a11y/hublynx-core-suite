import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildLeadFromPayload, type FieldMap } from "@/lib/pipeline/lead-mapping";

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

        const { data: hook } = await (supabaseAdmin as any)
          .from("lead_webhooks")
          .select(
            "id, owner_id, organization_id, active, direction, default_stage_id, default_source, call_count, field_map",
          )
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

        // guarda o último payload para o mapeador visual
        await supabaseAdmin
          .from("lead_webhooks")
          .update({ last_payload: raw as never, last_payload_at: new Date().toISOString() })
          .eq("id", hook.id);

        const mapped = buildLeadFromPayload(raw, (hook.field_map ?? {}) as FieldMap);
        const body = { ...mapped, source: mapped.source ?? hook.default_source ?? "webhook" };

        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid payload", issues: parsed.error.issues, detected: mapped },
            { status: 422 },
          );
        }

        let stageId = hook.default_stage_id;
        if (stageId) {
          // garante que a etapa configurada ainda existe e pertence ao dono do webhook
          const { data: target } = await supabaseAdmin
            .from("pipeline_stages")
            .select("id")
            .eq("id", stageId)
            .eq("owner_id", hook.owner_id)
            .maybeSingle();
          if (!target) stageId = null;
        }
        if (!stageId) {
          const { data: firstPipeline } = await supabaseAdmin
            .from("pipelines")
            .select("id")
            .eq("owner_id", hook.owner_id)
            .order("position")
            .limit(1)
            .maybeSingle();
          const query = supabaseAdmin
            .from("pipeline_stages")
            .select("id")
            .eq("owner_id", hook.owner_id)
            .order("position")
            .limit(1);
          const { data: firstStage } = await (firstPipeline
            ? query.eq("pipeline_id", firstPipeline.id)
            : query
          ).maybeSingle();
          stageId = firstStage?.id ?? null;
        }

        // A empresa vem do próprio cadastro do webhook; se faltar, resolve pelo dono.
        let organizationId: string | null = (hook.organization_id as string | null) ?? null;
        if (!organizationId) {
          try {
            const { data: org } = await (supabaseAdmin as unknown as { from: (t: string) => any })
              .from("organizations")
              .select("id")
              .eq("legacy_owner_id", hook.owner_id)
              .maybeSingle();
            organizationId = (org?.id as string | undefined) ?? null;
          } catch {
            organizationId = null;
          }
        }

        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({
            ...parsed.data,
            owner_id: hook.owner_id,
            ...(organizationId ? { organization_id: organizationId } : {}),
            stage_id: stageId,
            metadata: raw as never,
          } as never)
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
