// Server-only — cadastro vindo da landing page (coresuitecrm.com.br).
//
// Fluxo: canal de aquisição → landing → cadastro (conta + empresa de teste de 14 dias)
// → e-mail de contato@coresuitecrm.com.br com o link de verificação → a pessoa clica,
// o e-mail fica confirmado e ela entra logada no Core (acesso.coresuitecrm.com.br)
// → lead no CRM da Hublynx.
//
// A conta nasce NÃO confirmada: só entra quem abriu o link do e-mail. Cadastrar de novo
// com o mesmo e-mail ainda não confirmado reenvia o link (com a senha nova).

import { CORE_ORIGIN } from "@/lib/core-origin";

type Admin = { from: (t: string) => any; auth: any; rpc?: any };

export const HUBLYNX_ORG_ID = "2d4ce02e-5e15-4b0d-8192-0ca9a63aff1f";
export const LANDING_SOURCE = "Landing Core Suite";
/** Endereço do Core para quem vem da landing (cai para o do Core enquanto o domínio não responde). */
export const ACCESS_ORIGIN = "https://acesso.coresuitecrm.com.br";
/** Remetente dos e-mails do cadastro (SMTP da Hostinger, senha em segredo do servidor). */
export const SIGNUP_FROM = "contato@coresuitecrm.com.br";
export const SIGNUP_FROM_NAME = "Core Suite CRM";

export type LandingInput = {
  nome: string;
  empresa: string;
  email: string;
  telefone: string;
  senha: string;
  equipe?: string | null;
  interesse?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  landing_url?: string | null;
  referrer?: string | null;
};

export class SignupError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// endereço de acesso: acesso.coresuitecrm.com.br quando já responde pelo Core
let accessCache: { origin: string; at: number } | null = null;
export async function accessOrigin(): Promise<string> {
  if (accessCache && Date.now() - accessCache.at < 10 * 60_000) return accessCache.origin;
  let origin = CORE_ORIGIN;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch(`${ACCESS_ORIGIN}/api/public/forms-host`, { signal: ctl.signal });
    clearTimeout(t);
    const j = (await res.json().catch(() => null)) as { app?: string } | null;
    if (res.ok && j?.app === "core-suite") origin = ACCESS_ORIGIN;
  } catch {
    /* domínio ainda não ligado: usa o endereço do Core */
  }
  accessCache = { origin, at: Date.now() };
  return origin;
}

async function hublynxOrg(admin: Admin): Promise<{ id: string; ownerId: string | null }> {
  const { data } = await admin
    .from("organizations")
    .select("id, legacy_owner_id")
    .or(`slug.eq.hublynx,id.eq.${HUBLYNX_ORG_ID}`)
    .limit(1)
    .maybeSingle();
  if (!data?.id) throw new SignupError("Cadastro indisponível no momento. Fale com a Hublynx.", 503);
  return { id: data.id as string, ownerId: (data.legacy_owner_id as string | null) ?? null };
}

async function findUserByEmail(admin: Admin, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = (data?.users ?? []) as any[];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (users.length < 1000) return null;
  }
  return null;
}

/** 1) conta (não confirmada) + empresa de teste. */
export async function createLandingAccount(
  admin: Admin,
  d: LandingInput,
): Promise<{ userId: string; organizationId: string; createdNow: boolean }> {
  const meta = {
    full_name: d.nome,
    company_name: d.empresa,
    phone: d.telefone,
    team_size: d.equipe ?? null,
    signup_source: "landing",
  };
  let userId: string;
  let createdNow = false;

  const created = await admin.auth.admin.createUser({
    email: d.email,
    password: d.senha,
    email_confirm: false,
    user_metadata: meta,
  });
  if (!created.error && created.data?.user) {
    userId = created.data.user.id as string;
    createdNow = true;
  } else {
    const msg = String(created.error?.message ?? "");
    if (!/already|registered|exists/i.test(msg)) {
      throw new SignupError("Não foi possível criar a conta agora. Tente de novo em instantes.", 500);
    }
    const existing = await findUserByEmail(admin, d.email);
    if (!existing) throw new SignupError("Não foi possível criar a conta agora. Tente de novo em instantes.", 500);
    if (existing.email_confirmed_at) {
      throw new SignupError("Este e-mail já tem conta no Core Suite. Use “Entrar” ou “Esqueceu a senha?”.", 409);
    }
    // ainda não confirmou: atualiza a senha e reenvia o link
    const upd = await admin.auth.admin.updateUserById(existing.id, {
      password: d.senha,
      user_metadata: { ...(existing.user_metadata ?? {}), ...meta },
    });
    if (upd.error) throw new SignupError("Não foi possível reenviar o acesso agora.", 500);
    userId = existing.id as string;
  }

  try {
    const { ensureSelfServiceWorkspace } = await import("@/lib/org/self-service.server");
    const ws = await ensureSelfServiceWorkspace(admin, userId, { companyName: d.empresa });
    if (!ws.organizationId) throw new Error("sem empresa de teste");
    // o gatilho do banco usa o nome da pessoa: a empresa fica com o nome informado
    await admin
      .from("organizations")
      .update({ name: d.empresa })
      .eq("legacy_owner_id", userId)
      .eq("status", "trial");
    return { userId, organizationId: ws.organizationId, createdNow };
  } catch (e) {
    if (createdNow) await undoAccount(admin, userId);
    console.error("landing signup: workspace failed", (e as Error).message);
    throw new SignupError("Não foi possível liberar o teste agora. Tente de novo em instantes.", 500);
  }
}

export async function undoAccount(admin: Admin, userId: string) {
  await admin.from("organizations").delete().eq("legacy_owner_id", userId).eq("status", "trial");
  await admin.auth.admin.deleteUser(userId);
}

/** 2) link de verificação: confirma o e-mail e já entra logado (conferido pelo próprio Core). */
export async function verificationLink(admin: Admin, email: string, origin: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${origin}/auth/callback` },
  });
  const hashed = data?.properties?.hashed_token as string | undefined;
  if (error || !hashed) throw new SignupError("Não foi possível gerar o link de acesso. Tente de novo.", 500);
  // conta ainda não confirmada: o Supabase gera um token de CONFIRMAÇÃO (signup), não de magic
  // link — o tipo certo vem em verification_type e precisa ir junto para o verifyOtp aceitar
  const type = String(data?.properties?.verification_type ?? "magiclink");
  return `${origin}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=${encodeURIComponent(type)}`;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function verificationMail(d: LandingInput, link: string, origin: string) {
  const first = d.nome.split(/\s+/)[0] || "tudo bem";
  const subject = "Seu acesso ao Core Suite CRM: confirme seu e-mail";
  const text = `Olá, ${first}!

Sua conta no Core Suite CRM foi criada e o teste grátis de 14 dias já está reservado para a ${d.empresa}.

Confirme seu e-mail e entre no sistema por este link:
${link}

O link vale por pouco tempo e só pode ser usado uma vez. Depois, entre sempre em ${origin} com o e-mail ${d.email} e a senha que você criou.

Se você não fez este cadastro, ignore este e-mail.

Core Suite CRM
WhatsApp (12) 98261-8659 · ${SIGNUP_FROM}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F3F6F5;font-family:Arial,Helvetica,sans-serif;color:#071A3D">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#071A3D;color:#ffffff;padding:20px 28px;font-size:18px;font-weight:bold;letter-spacing:3px">CORE <span style="font-weight:normal">SUITE</span></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px;font-size:17px;font-weight:bold">Olá, ${esc(first)}!</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55">Sua conta no Core Suite CRM foi criada e o teste grátis de <strong>14 dias</strong> já está reservado para a <strong>${esc(d.empresa)}</strong>. Confirme seu e-mail para entrar:</p>
<p style="margin:0 0 22px"><a href="${esc(link)}" style="display:inline-block;background:#00D084;color:#071A3D;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:bold;font-size:15px">Confirmar e acessar o Core</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#F3F6F5;border-radius:10px;width:100%"><tr><td style="padding:14px 16px;font-size:14px;line-height:1.7">
Depois, entre sempre em <a href="${esc(origin)}/auth" style="color:#071A3D;font-weight:bold">${esc(origin.replace(/^https:\/\//, ""))}</a><br>
E-mail: <strong>${esc(d.email)}</strong><br>Senha: a que você criou no cadastro
</td></tr></table>
<p style="margin:0 0 6px;font-size:13px;color:#4A5874">O link vale por pouco tempo e só pode ser usado uma vez. Se ele vencer, faça o cadastro de novo com o mesmo e-mail que enviamos outro.</p>
<p style="margin:0;font-size:13px;color:#4A5874">Se você não fez este cadastro, ignore este e-mail.</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #DDE5E2;font-size:12px;color:#4A5874">Core Suite CRM · WhatsApp (12) 98261-8659 · ${SIGNUP_FROM}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

/**
 * 3) envia o e-mail de verificação SOMENTE como "Core Suite CRM" <contato@coresuitecrm.com.br>
 * (SMTP da Hostinger; senha no segredo SIGNUP_SMTP_PASSWORD do servidor). Sem o segredo ou
 * com falha no envio, não manda por outra caixa: o cadastro é desfeito e a pessoa tenta de novo.
 */
export async function sendVerification(_admin: Admin, d: LandingInput, link: string, origin: string) {
  const mail = verificationMail(d, link, origin);
  const pass = process.env["SIGNUP_SMTP_PASSWORD"];
  if (!pass) {
    console.error("landing signup: SIGNUP_SMTP_PASSWORD não configurado — e-mail não enviado");
    return { sent: false as const, from: null };
  }
  try {
    const { sendSmtpMail } = await import("@/server/mailSend.server");
    const user = process.env["SIGNUP_SMTP_USER"] || SIGNUP_FROM;
    await sendSmtpMail(
      {
        email: user,
        smtp_host: process.env["SIGNUP_SMTP_HOST"] || "smtp.hostinger.com",
        smtp_port: Number(process.env["SIGNUP_SMTP_PORT"] || 465),
        smtp_security: (process.env["SIGNUP_SMTP_SECURITY"] as "ssl" | "starttls" | undefined) || "ssl",
        smtp_username: user,
        smtp_auth: true,
      } as never,
      pass,
      { to: d.email, toName: d.nome, subject: mail.subject, text: mail.text, html: mail.html, replyTo: user },
      SIGNUP_FROM_NAME,
    );
    return { sent: true as const, from: user };
  } catch (e) {
    console.error("landing signup: SMTP contato failed", (e as Error).message);
    return { sent: false as const, from: null };
  }
}

/** 4) lead no CRM da Hublynx (pipeline principal, primeira etapa) + automações da etapa. */
export async function addLandingLead(
  admin: Admin,
  d: LandingInput,
  trial: { userId: string; organizationId: string },
): Promise<string | null> {
  try {
    const org = await hublynxOrg(admin);
    let ownerId = org.ownerId;

    let pipe = await admin
      .from("pipelines")
      .select("id, owner_id")
      .eq("organization_id", org.id)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (!pipe.data && ownerId) {
      pipe = await admin.from("pipelines").select("id, owner_id").eq("owner_id", ownerId).order("position").limit(1).maybeSingle();
    }
    if (pipe.data?.owner_id) ownerId = ownerId ?? (pipe.data.owner_id as string);
    if (!ownerId) throw new Error("Hublynx sem dono para o lead");

    let stageId: string | null = null;
    if (pipe.data?.id) {
      const { data: st } = await admin
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", pipe.data.id)
        .order("position")
        .limit(1)
        .maybeSingle();
      stageId = (st?.id as string | undefined) ?? null;
    }

    const raw = {
      origem: "landing-coresuitecrm",
      interesse: d.interesse ?? "teste",
      equipe: d.equipe ?? null,
      plano: "teste_14_dias",
      trial_user_id: trial.userId,
      trial_organization_id: trial.organizationId,
      trial_started_at: new Date().toISOString(),
      email_confirmado: false,
    };

    const { findDuplicate, duplicateMark } = await import("@/lib/pipeline/duplicates.server");
    const dup = await findDuplicate(admin as never, org.id, d.email, d.telefone);
    const mark = dup ? duplicateMark(dup) : null;

    const tags = ["teste-gratis", "landing"];
    if (d.interesse === "demonstracao") tags.push("pediu-demonstracao");

    const { data: lead, error } = await admin
      .from("leads")
      .insert({
        name: d.nome.slice(0, 200),
        company: d.empresa.slice(0, 200),
        email: d.email,
        phone: d.telefone,
        source: LANDING_SOURCE,
        value: 169.9,
        utm_source: d.utm_source ?? null,
        utm_medium: d.utm_medium ?? null,
        utm_campaign: d.utm_campaign ?? null,
        utm_content: d.utm_content ?? null,
        utm_term: d.utm_term ?? null,
        landing_url: d.landing_url ?? null,
        referrer: d.referrer ?? null,
        tags,
        temperature: "quente",
        owner_id: ownerId,
        organization_id: org.id,
        stage_id: stageId,
        metadata: mark ? { ...raw, ...mark } : raw,
      })
      .select("id")
      .single();
    if (error || !lead) throw new Error(error?.message ?? "lead não criado");

    await admin
      .from("lead_events")
      .insert({
        lead_id: lead.id,
        owner_id: ownerId,
        kind: "note",
        title: "Cadastrou-se para o teste grátis de 14 dias",
        description: `Cadastro pela landing. Empresa de teste criada (${d.empresa}). E-mail de verificação enviado. Equipe: ${d.equipe ?? "não informado"}.`,
      })
      .then(
        () => null,
        () => null,
      );

    if (stageId) {
      const { fireLeadAutomations } = await import("@/lib/automations/engine.server");
      await fireLeadAutomations({ leadId: lead.id as string, event: { kind: "enter" } });
    }
    return lead.id as string;
  } catch (e) {
    // o lead nunca impede a pessoa de usar o teste: fica no log para conferir
    console.error("landing signup: lead failed", (e as Error).message);
    return null;
  }
}
