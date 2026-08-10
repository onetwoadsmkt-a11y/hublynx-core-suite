import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  flattenPayload,
  splitBlob,
  utmFromUrl,
  type FieldMap,
} from "@/lib/pipeline/lead-mapping";

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

const ALIASES: Record<string, string[]> = {
  name: ["name", "nome", "full_name", "fullname", "nome_completo", "first_name", "primeiro_nome"],
  email: ["email", "e-mail", "e_mail", "mail", "emailaddress"],
  phone: ["phone", "telefone", "celular", "whatsapp", "fone", "tel"],
  company: ["company", "empresa", "organizacao"],
  city: ["city", "cidade"],
  state: ["state", "estado", "uf"],
  source: ["source", "origem", "canal"],
  value: ["value", "valor", "orcamento"],
  utm_source: ["utm_source"],
  utm_medium: ["utm_medium"],
  utm_campaign: ["utm_campaign", "campanha"],
  utm_term: ["utm_term"],
  utm_content: ["utm_content"],
  gclid: ["gclid"],
  fbclid: ["fbclid"],
  landing_url: ["landing_url", "page_url", "url", "pagina"],
  referrer: ["referrer", "referer"],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Converte o payload cru em campos de lead usando field_map + fallback por nomes. */
export function buildLeadFromPayload(raw: unknown, fieldMap: FieldMap) {
  const flat = flattenPayload(raw);
  const out: Record<string, string | undefined> = {};

  // 1) mapeamento configurado
  for (const [field, src] of Object.entries(fieldMap ?? {})) {
    if (!src) continue;
    if (typeof src === "object" && "const" in src) {
      out[field] = String(src.const);
    } else if (typeof src === "string" && flat[src] !== undefined) {
      out[field] = flat[src];
    }
  }

  // 2) fallback por nome de chave (última parte do caminho)
  for (const [field, aliases] of Object.entries(ALIASES)) {
    if (out[field]) continue;
    for (const [path, value] of Object.entries(flat)) {
      const leaf = norm(path.split(".").pop() ?? "");
      if (aliases.some((a) => norm(a) === leaf)) {
        out[field] = value;
        break;
      }
    }
  }

  // 3) payload grudado num campo só
  if (out.name && (out.name.includes("\n") || out.name.length > 120)) {
    const parts = splitBlob(out.name);
    out.email = out.email ?? parts.email;
    out.phone = out.phone ?? parts.phone;
    out.name = parts.name ?? out.name.slice(0, 120);
  }
  if (out.name) out.name = out.name.split(/[\n\r]/)[0]!.trim().slice(0, 200);

  // 4) UTMs vindos da URL da landing page
  const fromUrl = utmFromUrl(out.landing_url);
  for (const [k, v] of Object.entries(fromUrl)) if (!out[k]) out[k] = v;

  return out;
}

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
          .select(
            "id, owner_id, active, direction, default_stage_id, default_source, call_count, field_map",
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
          .insert({
            ...parsed.data,
            owner_id: hook.owner_id,
            stage_id: stageId,
            metadata: raw as never,
          })
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
