import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CORE_ORIGIN } from "@/lib/core-origin";

/**
 * Cadastro de nova conta (teste de 14 dias):
 * 1) cria o usuário NÃO confirmado com uma senha provisória gerada pelo Core;
 * 2) a empresa de teste nasce pelo gatilho do banco (provision_signup_trial);
 * 3) envia, pela caixa de e-mail da Hublynx (Core Suite), o link de confirmação e a senha;
 * 4) depois de confirmar, a pessoa entra com a senha provisória e o Core pede a senha nova.
 * Sem e-mail enviado, nada fica criado (a conta e a empresa de teste são removidas).
 */

const schema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome").max(120),
  company: z.string().trim().min(2, "Informe o nome da empresa").max(160),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  /** campo invisível: robôs preenchem, pessoas não */
  website: z.string().max(200).optional(),
});

type Admin = { from: (t: string) => any; auth: any };

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function mail(firstName: string, email: string, password: string, link: string) {
  const subject = "Confirme seu e-mail — Hublynx Core Suite";
  const text = `Olá, ${firstName}!

Sua conta no Hublynx Core Suite foi criada (teste de 14 dias).

1) Confirme seu e-mail: ${link}
2) Entre em ${CORE_ORIGIN}/auth com:
   E-mail: ${email}
   Senha provisória: ${password}
3) No primeiro acesso o Core pede para você criar a sua senha.

Se você não pediu esta conta, ignore este e-mail.
Hublynx Core Suite`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0a2557;color:#ffffff;padding:18px 28px;font-size:18px;font-weight:bold">Hublynx Core Suite</td></tr>
<tr><td style="padding:26px 28px">
<p style="margin:0 0 12px;font-size:16px">Olá, ${esc(firstName)}!</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5">Sua conta no <strong>Hublynx Core Suite</strong> foi criada. Seu teste de 14 dias começa agora.</p>
<p style="margin:0 0 8px;font-size:15px"><strong>1.</strong> Confirme seu e-mail:</p>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#00D084;color:#04281A;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;font-size:15px">Confirmar meu e-mail</a></p>
<p style="margin:0 0 8px;font-size:15px"><strong>2.</strong> Entre com a senha provisória:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#f4f5f7;border-radius:8px;width:100%"><tr><td style="padding:14px 16px;font-size:14px;line-height:1.7">
E-mail: <strong>${esc(email)}</strong><br>Senha provisória: <strong style="font-family:Consolas,monospace;font-size:16px;letter-spacing:.5px">${esc(password)}</strong>
</td></tr></table>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5"><strong>3.</strong> No primeiro acesso, o Core pede para você criar a sua senha.</p>
<p style="margin:0;font-size:12px;color:#6b7280">Se você não pediu esta conta, ignore este e-mail. Endereço do Core: ${esc(CORE_ORIGIN)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

async function hublynxOrgId(admin: Admin) {
  const { data } = await admin.from("organizations").select("id").eq("slug", "hublynx").maybeSingle();
  if (data?.id) return data.id as string;
  const { data: byName } = await admin.from("organizations").select("id").ilike("name", "hublynx").limit(1).maybeSingle();
  return (byName?.id as string | undefined) ?? null;
}

export const requestSignup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    // robô: finge sucesso sem fazer nada
    if (data.website) return { ok: true as const, email: data.email };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Admin;
    const { generatePassword, sendOrgMail } = await import("@/lib/projects/client-invite.server");
    const senderOrg = await hublynxOrgId(admin);
    if (!senderOrg) throw new Error("Cadastro indisponível no momento. Fale com o suporte da Hublynx.");

    const password = generatePassword();
    const redirectTo = `${CORE_ORIGIN}/auth/callback?confirmado=1`;
    const meta = { full_name: data.fullName, company_name: data.company, must_change_password: true };

    let link: string | null = null;
    let userId: string | null = null;
    let createdNow = false;
    const gen = await admin.auth.admin.generateLink({
      type: "signup",
      email: data.email,
      password,
      options: { data: meta, redirectTo },
    });
    if (!gen.error && gen.data?.properties?.action_link) {
      link = gen.data.properties.action_link;
      userId = gen.data.user?.id ?? null;
      createdNow = true;
    } else {
      // já existe: se ainda não confirmou, gera nova senha provisória e reenvia
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = (list?.users ?? []).find((u: any) => (u.email ?? "").toLowerCase() === data.email);
      if (!existing) throw new Error(gen.error?.message ?? "Não foi possível criar a conta.");
      if (existing.email_confirmed_at) {
        throw new Error("Este e-mail já tem conta no Core. Use “Entrar” ou “Esqueceu a senha?”.");
      }
      const upd = await admin.auth.admin.updateUserById(existing.id, {
        password,
        user_metadata: { ...(existing.user_metadata ?? {}), ...meta },
      });
      if (upd.error) throw new Error(upd.error.message);
      const again = await admin.auth.admin.generateLink({ type: "magiclink", email: data.email, options: { redirectTo } });
      if (again.error || !again.data?.properties?.action_link) throw new Error(again.error?.message ?? "Não foi possível gerar o link.");
      link = again.data.properties.action_link;
      userId = existing.id;
    }

    // empresa de teste liberada na hora (mesmo sem o gatilho do banco instalado)
    if (userId) {
      const { ensureSelfServiceWorkspace } = await import("@/lib/org/self-service.server");
      await ensureSelfServiceWorkspace(admin, userId, { companyName: data.company }).catch(() => undefined);
    }
    // nome da empresa de teste = o informado (o gatilho usa o nome da pessoa)
    if (userId && createdNow) {
      await admin
        .from("organizations")
        .update({ name: data.company })
        .eq("legacy_owner_id", userId)
        .eq("status", "trial");
    }

    const first = data.fullName.split(/\s+/)[0] || "tudo bem";
    const sent = await sendOrgMail(admin as any, {
      organizationId: senderOrg,
      to: data.email,
      toName: data.fullName,
      build: () => mail(first, data.email, password, link!),
    });
    if (!sent.sent) {
      // sem e-mail a pessoa não teria a senha: desfaz o que foi criado agora
      if (userId && createdNow) {
        await admin.from("organizations").delete().eq("legacy_owner_id", userId).eq("status", "trial");
        await admin.auth.admin.deleteUser(userId);
      }
      throw new Error("Não conseguimos enviar o e-mail de confirmação agora. Tente de novo em alguns minutos ou fale com o suporte da Hublynx.");
    }
    return { ok: true as const, email: data.email };
  });
