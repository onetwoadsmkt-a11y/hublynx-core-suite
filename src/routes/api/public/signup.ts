import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Cadastro da landing page (coresuitecrm.com.br) → conta + teste de 14 dias + e-mail de verificação
// (contato@coresuitecrm.com.br) com o link de acesso + lead na Hublynx.
// A lógica fica em src/lib/signup/landing.server.ts.

const ALLOWED_ORIGINS = new Set([
  "https://coresuitecrm.com.br",
  "https://www.coresuitecrm.com.br",
  "https://corsuitecrm.com.br",
  "https://www.corsuitecrm.com.br",
  "https://core.hublynx.com.br",
  "https://acesso.coresuitecrm.com.br",
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

// Envio comum de formulário (sem fetch): a resposta é um redirecionamento — para o Core
// (logado) quando dá certo, ou de volta à landing com ?erro= quando não. Funciona em
// qualquer navegador, sem depender de CORS (Safari "Load failed").
function backToLanding(request: Request, message: string | null) {
  let base = "https://coresuitecrm.com.br/";
  const ref = request.headers.get("referer");
  try {
    if (ref) {
      const u = new URL(ref);
      if (ALLOWED_ORIGINS.has(u.origin)) base = `${u.origin}${u.pathname}`;
    }
  } catch {
    /* referer inválido: volta para a landing principal */
  }
  return new Response(null, {
    status: 303,
    headers: { Location: message ? `${base}?erro=${encodeURIComponent(message)}#teste` : `${base}?enviado=1#teste` },
  });
}

export const Route = createFileRoute("/api/public/signup")({
  server: {
    handlers: {
      // conferência rápida de que o endereço está publicado
      GET: async ({ request }) =>
        Response.json({ ok: true, service: "core-suite-signup" }, { headers: corsHeaders(request.headers.get("origin")) }),

      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),

      POST: async ({ request }) => {
        const headers = corsHeaders(request.headers.get("origin"));
        const ct = request.headers.get("content-type") ?? "";
        const formMode = ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");
        const reply = (body: unknown, status: number) => {
          if (formMode) {
            const b = body as { message?: string };
            if (status < 300) return backToLanding(request, null);
            return backToLanding(request, b.message ?? "Não foi possível criar a conta agora.");
          }
          return Response.json(body, { status, headers });
        };

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "?";
        if (tooMany(ip)) return reply({ message: "Muitas tentativas. Aguarde alguns minutos." }, 429);

        // a landing envia JSON como text/plain (pedido "simples", sem pré-verificação CORS)
        // ou, como reserva, um envio comum de formulário
        let body: unknown;
        try {
          body = formMode
            ? Object.fromEntries([...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]))
            : JSON.parse(await request.text());
        } catch {
          return reply({ message: "Envio inválido." }, 400);
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return reply({ message: parsed.error.issues[0]?.message ?? "Confira os dados." }, 422);
        }
        const d = parsed.data;
        // robô: finge sucesso sem fazer nada
        if (d.website) return reply({ ok: true, sent: true }, 201);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as never;
        const L = await import("@/lib/signup/landing.server");

        try {
          const origin = await L.accessOrigin();
          const trial = await L.createLandingAccount(admin, d);
          let link: string;
          try {
            link = await L.verificationLink(admin, d.email, origin);
          } catch (e) {
            if (trial.createdNow) await L.undoAccount(admin, trial.userId);
            throw e;
          }
          const mail = await L.sendVerification(admin, d, link, origin);
          if (!mail.sent) {
            // sem e-mail a pessoa não teria como entrar: desfaz a conta criada agora
            if (trial.createdNow) await L.undoAccount(admin, trial.userId);
            return reply(
              { message: "Não conseguimos enviar o e-mail de confirmação agora. Tente de novo em alguns minutos ou fale com a gente no WhatsApp." },
              502,
            );
          }
          const leadId = trial.createdNow ? await L.addLandingLead(admin, d, trial) : null;
          return reply({ ok: true, sent: true, resent: !trial.createdNow, lead_id: leadId }, 201);
        } catch (e) {
          if (e instanceof L.SignupError) return reply({ message: e.message }, e.status);
          console.error("landing signup failed", (e as Error).message);
          return reply({ message: "Não foi possível criar a conta agora. Tente de novo em instantes." }, 500);
        }
      },
    },
  },
});
