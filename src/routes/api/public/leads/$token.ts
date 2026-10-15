import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildLeadFromPayload, type FieldMap } from "@/lib/pipeline/lead-mapping";

// Textos longos demais são cortados (não recusam o lead): o valor completo continua
// guardado nos dados brutos (metadata). Ex.: fbclid do Facebook passa de 200 caracteres.
const cut = (n: number) =>
  z
    .string()
    .transform((v) => v.slice(0, n))
    .optional()
    .nullable();

const payloadSchema = z.object({
  name: z
    .string()
    .min(1)
    .transform((v) => v.slice(0, 200)),
  company: cut(200),
  email: cut(200),
  phone: cut(60),
  city: cut(120),
  state: cut(60),
  source: cut(120),
  value: z.coerce.number().nonnegative().optional().nullable(),
  lead_score: z.coerce.number().optional().nullable(),
  lead_classification: cut(40),
  utm_source: cut(200),
  utm_medium: cut(200),
  utm_campaign: cut(200),
  utm_term: cut(200),
  utm_content: cut(200),
  gclid: cut(500),
  fbclid: cut(500),
  landing_url: cut(1000),
  referrer: cut(1000),
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
          const { data: firstStage } = await (
            firstPipeline ? query.eq("pipeline_id", firstPipeline.id) : query
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

        // Mesmo lead chegando por mais de um caminho (Make + Lead Pro + formulário Core):
        // em vez de duplicar, completa o cadastro existente da mesma empresa.
        const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "").slice(-11);
        const email = parsed.data.email?.trim().toLowerCase() || null;
        const phone = digits(parsed.data.phone) || null;
        if (organizationId && (email || (phone && phone.length >= 10))) {
          const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
          const { data: recent } = await (supabaseAdmin as any)
            .from("leads")
            .select("*")
            .eq("organization_id", organizationId)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(1000);
          const existing = ((recent ?? []) as Record<string, any>[]).find(
            (l) =>
              (email &&
                String(l.email ?? "")
                  .trim()
                  .toLowerCase() === email) ||
              (phone && phone.length >= 10 && digits(l.phone) === phone),
          );
          if (existing) {
            const patch: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(parsed.data)) {
              if (v === null || v === undefined || v === "") continue;
              if (k === "lead_score" || k === "lead_classification") continue;
              const cur = existing[k];
              if (cur === null || cur === undefined || cur === "") patch[k] = v;
            }
            // a qualificação do formulário é a referência: sempre atualiza quando vier
            if (parsed.data.lead_classification)
              patch.lead_classification = parsed.data.lead_classification;
            if (parsed.data.lead_score !== null && parsed.data.lead_score !== undefined) {
              patch.lead_score = parsed.data.lead_score;
            }
            const prevMeta =
              existing.metadata &&
              typeof existing.metadata === "object" &&
              !Array.isArray(existing.metadata)
                ? (existing.metadata as Record<string, unknown>)
                : {};
            patch.metadata = { ...prevMeta, ...raw, merged_at: new Date().toISOString() };
            const { error: upErr } = await supabaseAdmin
              .from("leads")
              .update(patch as never)
              .eq("id", existing.id);
            if (upErr) {
              console.error("lead webhook merge failed", upErr.message);
              return Response.json({ error: upErr.message }, { status: 500 });
            }
            await supabaseAdmin
              .from("lead_webhooks")
              .update({
                call_count: (hook.call_count ?? 0) + 1,
                last_called_at: new Date().toISOString(),
              })
              .eq("id", hook.id);
            return Response.json({ ok: true, lead_id: existing.id, merged: true }, { status: 200 });
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
          .update({
            call_count: (hook.call_count ?? 0) + 1,
            last_called_at: new Date().toISOString(),
          })
          .eq("id", hook.id);

        return Response.json({ ok: true, lead_id: lead.id }, { status: 201 });
      },
    },
  },
});
