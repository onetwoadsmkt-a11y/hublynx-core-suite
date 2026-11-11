import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Cadastro da landing page (coresuitecrm.com.br) → conta + teste de 14 dias + lead na Hublynx.
// A lógica fica em src/lib/signup/landing.server.ts.

const ALLOWED_ORIGINS = new Set([
  "https://coresuitecrm.com.br",
  "https://www.coresuitecrm.com.br",
  "https://corsuitecrm.com.br",
  "https://www.corsuitecrm.com.br",
  "https://core.hublynx.com.br",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const ok = origin && (ALLOWED_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin! } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const opt = (n: number) =>
  z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v ? v.slice(0, n) : null))
    .optional()
    .nullable();

const schema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome").max(120),
  empresa: z.string().trim().min(2, "Informe o nome da empresa").max(160),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  telefone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 10 && v.length <= 13, "WhatsApp inválido"),
  senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres").max(72),
  equipe: opt(40),
  interesse: opt(40),
  utm_source: opt(200),
  utm_medium: opt(200),
  utm_campaign: opt(200),
  utm_content: opt(200),
  utm_term: opt(200),
  landing_url: opt(1000),
  referrer: opt(1000),
  /** campo invisível: robôs preenchem, pessoas não */
  website: z.string().max(200).optional().nullable(),
});

// limite simples por IP (por instância do servidor): 5 cadastros a cada 10 minutos
const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 5;
}

export const Route = createFileRoute("/api/public/signup")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const headers = corsHeaders(request.headers.get("origin"));
        const reply = (body: unknown, status: number) => Response.json(body, { status, headers });

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "?";
        if (tooMany(ip)) return reply({ message: "Muitas tentativas. Aguarde alguns minutos." }, 429);

        // a landing envia JSON como text/plain (pedido "simples", sem pré-verificação CORS)
        let body: unknown;
        try {
          body = JSON.parse(await request.text());
        } catch {
          return reply({ message: "Envio inválido." }, 400);
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return reply({ message: parsed.error.issues[0]?.message ?? "Confira os dados." }, 422);
        }
        const d = parsed.data;
        // robô: finge sucesso sem fazer nada
        if (d.website) return reply({ ok: true, redirect: "https://core.hublynx.com.br/auth" }, 201);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as never;
        const { createLandingAccount, accessLink, addLandingLead, sendWelcome, SignupError } = await import(
          "@/lib/signup/landing.server"
        );

        try {
          const input = { ...d, telefone: d.telefone };
          const trial = await createLandingAccount(admin, input);
          const [redirect, leadId] = await Promise.all([
            accessLink(admin, d.email),
            addLandingLead(admin, input, trial),
          ]);
          void sendWelcome(admin, input);
          return reply({ ok: true, redirect, lead_id: leadId }, 201);
        } catch (e) {
          if (e instanceof SignupError) return reply({ message: e.message }, e.status);
          console.error("landing signup failed", (e as Error).message);
          return reply({ message: "Não foi possível criar a conta agora. Tente de novo em instantes." }, 500);
        }
      },
    },
  },
});
