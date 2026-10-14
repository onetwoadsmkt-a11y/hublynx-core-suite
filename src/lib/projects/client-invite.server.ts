// Server-only — senha gerada e e-mail de convite do portal do cliente.
type Db = { from: (t: string) => any };

/** Senha legível e aleatória para o primeiro acesso do cliente. */
export function generatePassword(): string {
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (set: string, n: number) => {
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    return Array.from(buf, (v) => set[v % set.length]).join("");
  };
  return `${pick(upper, 1)}${pick(lower, 4)}-${pick(digits, 4)}-${pick(lower + upper, 3)}`;
}

function h(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export type InviteMailInput = {
  inviterId: string;
  organizationId: string;
  projectName: string;
  projectNumber: number | null;
  clientName: string;
  clientEmail: string;
  /** null = conta já existente da equipe: o cliente usa a senha que já tem */
  password: string | null;
  portalUrl: string;
};

export type InviteMailResult = { sent: boolean; from: string | null; error: string | null };

/**
 * Envia o convite pela caixa de e-mail (SMTP) conectada em Configurações → Integrações:
 * primeiro a de quem convida; se não houver, a de um administrador da empresa.
 * Nunca lança erro: devolve o motivo para a tela mostrar.
 */
export async function sendClientInviteMail(
  admin: Db,
  p: InviteMailInput,
): Promise<InviteMailResult> {
  try {
    const { getMailCredentials } = await import("@/server/mailAccounts.server");
    const { sendSmtpMail } = await import("@/server/mailSend.server");

    const { data: admins } = await admin
      .from("organization_members")
      .select("user_id, created_at")
      .eq("organization_id", p.organizationId)
      .in("role", ["org_admin", "owner", "admin"])
      .eq("status", "active")
      .order("created_at", { ascending: true });
    const candidates = [
      p.inviterId,
      ...((admins ?? []) as { user_id: string }[]).map((a) => a.user_id),
    ].filter((v, i, arr) => !!v && arr.indexOf(v) === i);

    let creds: Awaited<ReturnType<typeof getMailCredentials>> = null;
    let senderId: string | null = null;
    let keyMissing = false;
    for (const id of candidates) {
      try {
        creds = await getMailCredentials(id);
      } catch (err) {
        if (/is not set/.test(String((err as Error)?.message))) keyMissing = true;
        creds = null;
      }
      if (creds) {
        senderId = id;
        break;
      }
    }
    if (!creds || !senderId) {
      return {
        sent: false,
        from: null,
        error: keyMissing
          ? "A chave de criptografia do e-mail (MAIL_PASSWORD_ENCRYPTION_KEY) não está configurada no servidor."
          : "Nenhuma caixa de e-mail conectada. Conecte o seu e-mail em Configurações → Integrações → E-mail (IMAP/SMTP).",
      };
    }

    const [{ data: org }, { data: prof }] = await Promise.all([
      admin.from("organizations").select("name").eq("id", p.organizationId).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", senderId).maybeSingle(),
    ]);
    const orgName = ((org?.name as string | undefined) ?? "").trim();
    const senderName =
      (
        creds.account.display_name ||
        (prof?.full_name as string | undefined) ||
        orgName ||
        ""
      ).trim() || null;
    const firstName = p.clientName.trim().split(/\s+/)[0];
    const projectLabel = `${p.projectNumber ? `Nº ${p.projectNumber} · ` : ""}${p.projectName}`;
    const who = senderName ?? "Nossa equipe";
    const fromOrg = orgName && senderName !== orgName ? `, da ${orgName},` : "";
    const subject = `Seu acesso ao projeto ${p.projectName}${orgName ? ` — ${orgName}` : ""}`;

    const text = [
      `Olá, ${firstName}!`,
      "",
      `${who}${fromOrg} convidou você para acompanhar o projeto ${projectLabel} no portal do cliente.`,
      "",
      "No portal você acompanha o andamento, conclui as tarefas que são sua responsabilidade e conversa com a equipe.",
      "",
      `Acesse: ${p.portalUrl}`,
      `E-mail: ${p.clientEmail}`,
      p.password
        ? `Senha: ${p.password}`
        : "Senha: use a senha que você já tem (ou clique em “Esqueci a senha”).",
      "",
      ...(p.password
        ? ["Recomendamos trocar a senha no primeiro acesso (botão “Alterar senha” no portal).", ""]
        : []),
      "Qualquer dúvida, é só responder este e-mail.",
      "",
      senderName ?? "",
      ...(orgName && senderName !== orgName ? [orgName] : []),
    ].join("\n");

    const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0f2b4c;color:#ffffff;padding:20px 28px;font-size:18px;font-weight:bold">${h(orgName || "Portal do cliente")}</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 14px;font-size:16px">Olá, ${h(firstName)}!</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${h(who)}${h(fromOrg)} convidou você para acompanhar o projeto <strong>${h(projectLabel)}</strong> no portal do cliente.</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">No portal você acompanha o andamento, conclui as tarefas que são sua responsabilidade e conversa com a equipe.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="background:#f4f5f7;border-radius:8px;width:100%;margin:0 0 20px"><tr><td style="padding:16px 18px;font-size:14px;line-height:1.8">
<strong>E-mail:</strong> ${h(p.clientEmail)}<br>
${
  p.password
    ? `<strong>Senha:</strong> <span style="font-family:Consolas,Menlo,monospace;font-size:15px">${h(p.password)}</span>`
    : "<strong>Senha:</strong> use a senha que você já tem (ou “Esqueci a senha”)."
}
</td></tr></table>
<p style="margin:0 0 22px"><a href="${h(p.portalUrl)}" style="display:inline-block;background:#0f2b4c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:15px">Acessar o projeto</a></p>
<p style="margin:0 0 6px;font-size:12px;color:#6b7280">Se o botão não abrir, copie este endereço: ${h(p.portalUrl)}</p>
${p.password ? '<p style="margin:0 0 6px;font-size:12px;color:#6b7280">Recomendamos trocar a senha no primeiro acesso (botão “Alterar senha” no portal).</p>' : ""}
<p style="margin:18px 0 0;font-size:14px">Qualquer dúvida, é só responder este e-mail.<br><br>${h(senderName ?? "")}${orgName && senderName !== orgName ? `<br>${h(orgName)}` : ""}</p>
</td></tr></table></td></tr></table></body></html>`;

    await sendSmtpMail(
      creds.account,
      creds.password,
      {
        to: p.clientEmail,
        toName: p.clientName,
        subject,
        text,
        html,
        replyTo: creds.account.email,
      },
      senderName,
    );
    return { sent: true, from: creds.account.email, error: null };
  } catch (err) {
    return {
      sent: false,
      from: null,
      error: String((err as Error)?.message ?? "") || "Não foi possível enviar o e-mail.",
    };
  }
}
