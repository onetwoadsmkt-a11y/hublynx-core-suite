// Server-only — cadastro vindo da landing page (coresuitecrm.com.br).
//
// Fluxo: canal de aquisição → landing → este cadastro → acesso imediato ao Core
// → lead no CRM da Hublynx → teste de 14 dias já correndo.
//
// Diferença para `requestSignup` (tela /auth): aqui a pessoa escolhe a senha na landing,
// então a conta nasce confirmada e ela entra na hora por um link de acesso único
// (magic link) devolvido para a landing redirecionar. O e-mail de boas-vindas é só aviso.

import { CORE_ORIGIN } from "@/lib/core-origin";

type Admin = { from: (t: string) => any; auth: any; rpc?: any };

export const HUBLYNX_ORG_ID = "2d4ce02e-5e15-4b0d-8192-0ca9a63aff1f";
export const LANDING_SOURCE = "Landing Core Suite";

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

/** 1) conta + empresa de teste. Devolve o id do usuário e da empresa de teste. */
export async function createLandingAccount(admin: Admin, d: LandingInput) {
  const meta = {
    full_name: d.nome,
    company_name: d.empresa,
    phone: d.telefone,
    team_size: d.equipe ?? null,
    signup_source: "landing",
  };
  const created = await admin.auth.admin.createUser({
    email: d.email,
    password: d.senha,
    email_confirm: true,
    user_metadata: meta,
  });
  if (created.error || !created.data?.user) {
    const msg = String(created.error?.message ?? "");
    if (/already|registered|exists/i.test(msg)) {
      throw new SignupError("Este e-mail já tem conta no Core. Use “Entrar” ou “Esqueceu a senha?”.", 409);
    }
    throw new SignupError("Não foi possível criar a conta agora. Tente de novo em instantes.", 500);
  }
  const userId = created.data.user.id as string;

  try {
    // empresa de teste (o gatilho do banco pode já ter criado; aqui garante)
    const { ensureSelfServiceWorkspace } = await import("@/lib/org/self-service.server");
    const ws = await ensureSelfServiceWorkspace(admin, userId, { companyName: d.empresa });
    if (!ws.organizationId) throw new Error("sem empresa de teste");
    // o gatilho usa o nome da pessoa: a empresa fica com o nome informado
    await admin
      .from("organizations")
      .update({ name: d.empresa })
      .eq("legacy_owner_id", userId)
      .eq("status", "trial");
    return { userId, organizationId: ws.organizationId };
  } catch (e) {
    // sem empresa a pessoa entraria num Core vazio: desfaz tudo
    await admin.from("organizations").delete().eq("legacy_owner_id", userId).eq("status", "trial");
    await admin.auth.admin.deleteUser(userId);
    console.error("landing signup: workspace failed", (e as Error).message);
    throw new SignupError("Não foi possível liberar o teste agora. Tente de novo em instantes.", 500);
  }
}

/** 2) link de acesso único: a landing redireciona e a pessoa já entra logada. */
export async function accessLink(admin: Admin, email: string): Promise<string> {
  const fallback = `${CORE_ORIGIN}/auth`;
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${CORE_ORIGIN}/auth/callback` },
    });
    return error ? fallback : (data?.properties?.action_link ?? fallback);
  } catch {
    return fallback;
  }
}

/** 3) lead no CRM da Hublynx (pipeline principal, primeira etapa) + automações da etapa. */
export async function addLandingLead(
  admin: Admin,
  d: LandingInput,
  trial: { userId: string; organizationId: string },
): Promise<string | null> {
  try {
    const org = await hublynxOrg(admin);
    let ownerId = org.ownerId;

    // pipeline principal da Hublynx (por empresa; contas antigas por dono)
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
        title: "Começou o teste grátis de 14 dias",
        description: `Cadastro pela landing. Empresa de teste criada (${d.empresa}). Equipe: ${d.equipe ?? "não informado"}.`,
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

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** 4) boas-vindas (melhor esforço — a pessoa já entrou pela landing). */
export async function sendWelcome(admin: Admin, d: LandingInput) {
  try {
    const org = await hublynxOrg(admin);
    const { sendOrgMail } = await import("@/lib/projects/client-invite.server");
    const first = d.nome.split(/\s+/)[0] || "tudo bem";
    await sendOrgMail(admin as never, {
      organizationId: org.id,
      to: d.email,
      toName: d.nome,
      build: () => ({
        subject: "Seu teste do Core Suite começou",
        text: `Olá, ${first}!\n\nSeu teste grátis de 14 dias do Core Suite está ativo.\n\nEntre em ${CORE_ORIGIN}/auth com o e-mail ${d.email} e a senha que você criou.\n\nQualquer dúvida, é só responder este e-mail.\nCore Suite · Hublynx`,
        html: `<!doctype html><html><body style="margin:0;background:#F3F6F5;font-family:Arial,Helvetica,sans-serif;color:#071A3D">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#071A3D;color:#fff;padding:18px 28px;font-size:18px;font-weight:bold;letter-spacing:2px">CORE SUITE</td></tr>
<tr><td style="padding:26px 28px">
<p style="margin:0 0 12px;font-size:16px">Olá, ${esc(first)}!</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5">Seu teste grátis de <strong>14 dias</strong> do Core Suite está ativo. Entre quando quiser com o e-mail <strong>${esc(d.email)}</strong> e a senha que você criou.</p>
<p style="margin:0 0 20px"><a href="${CORE_ORIGIN}/auth" style="display:inline-block;background:#00D084;color:#071A3D;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold">Entrar no Core</a></p>
<p style="margin:0;font-size:13px;color:#4A5874">Qualquer dúvida, é só responder este e-mail.</p>
</td></tr></table></td></tr></table></body></html>`,
      }),
    });
  } catch {
    /* sem e-mail não é erro: a pessoa já está dentro do Core */
  }
}
