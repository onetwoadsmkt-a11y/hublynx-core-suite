// Server-only — senha gerada e e-mail de convite (portal do cliente ou equipe do projeto).
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
  /** "cliente" (portal do cliente) ou "equipe" (membro da equipe do projeto) */
  audience?: "cliente" | "equipe";
};

export type InviteMailResult = { sent: boolean; from: string | null; error: string | null };

/**
 * Envia o convite pela caixa de e-mail (SMTP) conectada em Configurações → Integrações:
 * primeiro a conta Google (Gmail) de quem convida ou de um administrador; se não houver,
 * o e-mail IMAP/SMTP conectado em Configurações → Integrações.
 * Nunca lança erro: devolve o motivo para a tela mostrar.
 */
export type OrgMailContent = { subject: string; text: string; html: string };

/**
 * Envia um e-mail pela conta conectada da empresa (Gmail de quem pede ou de um
 * administrador; senão o IMAP/SMTP de Configurações → Integrações).
 * `build` recebe o nome de quem envia e o nome da empresa. Nunca lança erro.
 */
export async function sendOrgMail(
  admin: Db,
  p: {
    organizationId: string;
    preferUserIds?: (string | null | undefined)[];
    to: string;
    toName?: string | null;
    build: (senderName: string | null, orgName: string) => OrgMailContent;
  },
): Promise<InviteMailResult> {
  try {
    const { getMailCredentials } = await import("@/server/mailAccounts.server");
    const { sendSmtpMail, buildMimeMessage } = await import("@/server/mailSend.server");
    const { getConnection, googleFetch } = await import("@/server/googleOAuth.server");

    const { data: admins } = await admin
      .from("organization_members")
      .select("user_id, created_at")
      .eq("organization_id", p.organizationId)
      .in("role", ["org_admin", "owner", "admin"])
      .eq("status", "active")
      .order("created_at", { ascending: true });
    const candidates = [
      ...(p.preferUserIds ?? []),
      ...((admins ?? []) as { user_id: string }[]).map((a) => a.user_id),
    ].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i);

    // Ordem: Google (Gmail) de quem convida e dos admins; depois e-mail IMAP/SMTP.
    type Sender =
      | { kind: "google"; userId: string; email: string; displayName: null }
      | {
          kind: "smtp";
          userId: string;
          email: string;
          displayName: string | null;
          creds: NonNullable<Awaited<ReturnType<typeof getMailCredentials>>>;
        };
    const senders: Sender[] = [];
    for (const id of candidates) {
      const conn = await getConnection(id).catch(() => null);
      const canSend = (conn?.scopes ?? []).some(
        (s) => s === "gmail.send" || s.endsWith("/gmail.send"),
      );
      if (conn?.google_email && conn.status !== "revoked" && canSend) {
        senders.push({ kind: "google", userId: id, email: conn.google_email, displayName: null });
      }
    }
    let keyMissing = false;
    for (const id of candidates) {
      try {
        const creds = await getMailCredentials(id);
        if (creds)
          senders.push({
            kind: "smtp",
            userId: id,
            email: creds.account.email,
            displayName: creds.account.display_name,
            creds,
          });
      } catch (err) {
        if (/is not set/.test(String((err as Error)?.message))) keyMissing = true;
      }
    }
    if (!senders.length) {
      return {
        sent: false,
        from: null,
        error: keyMissing
          ? "A chave de criptografia do e-mail (MAIL_PASSWORD_ENCRYPTION_KEY) não está configurada no servidor."
          : "Nenhum e-mail conectado. Conecte sua conta Google (com envio de e-mail) ou um e-mail IMAP/SMTP em Configurações → Integrações.",
      };
    }

    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", p.organizationId)
      .maybeSingle();
    const orgName = ((org?.name as string | undefined) ?? "").trim();
    const errors: string[] = [];

    for (const sender of senders) {
      const { data: prof } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", sender.userId)
        .maybeSingle();
      const senderName =
        (sender.displayName || (prof?.full_name as string | undefined) || orgName || "").trim() ||
        null;
      const { subject, text, html } = p.build(senderName, orgName);
      const mail = {
        to: p.to,
        toName: p.toName ?? p.to,
        subject,
        text,
        html,
        replyTo: sender.email,
      };
      try {
        if (sender.kind === "google") {
          const raw = buildMimeMessage({ email: sender.email, name: senderName }, mail);
          const b64url = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
          const res = await googleFetch(
            sender.userId,
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ raw: b64url }),
            },
          );
          if (!res.ok) {
            const j: any = await res.json().catch(() => ({}));
            throw new Error(`Gmail: ${j?.error?.message ?? `HTTP ${res.status}`}`);
          }
        } else {
          await sendSmtpMail(sender.creds.account, sender.creds.password, mail, senderName);
        }
        return { sent: true, from: sender.email, error: null };
      } catch (err) {
        errors.push(`${sender.email}: ${String((err as Error)?.message ?? err)}`);
      }
    }
    return {
      sent: false,
      from: null,
      error: errors.join(" • ") || "Não foi possível enviar o e-mail.",
    };
  } catch (err) {
    return {
      sent: false,
      from: null,
      error: String((err as Error)?.message ?? "") || "Não foi possível enviar o e-mail.",
    };
  }
}

/** Convite de acesso ao projeto (portal do cliente ou equipe no Core). */
export async function sendClientInviteMail(
  admin: Db,
  p: InviteMailInput,
): Promise<InviteMailResult> {
  return sendOrgMail(admin, {
    organizationId: p.organizationId,
    preferUserIds: [p.inviterId],
    to: p.clientEmail,
    toName: p.clientName,
    build: (senderName, orgName) => {
      const firstName = p.clientName.trim().split(/\s+/)[0];
      const projectLabel = `${p.projectNumber ? `Nº ${p.projectNumber} · ` : ""}${p.projectName}`;
      const who = senderName ?? "Nossa equipe";
      const fromOrg = orgName && senderName !== orgName ? `, da ${orgName},` : "";
      const team = p.audience === "equipe";
      const subject = `${team ? "Convite para a equipe do projeto" : "Seu acesso ao projeto"} ${p.projectName}${orgName ? ` — ${orgName}` : ""}`;
      const inviteTail = team ? "na equipe do projeto" : "para acompanhar o projeto";
      const where = team ? "no Core" : "no portal do cliente";
      const about = team
        ? "No Core você acompanha as etapas, as tarefas e os prazos do projeto junto com a equipe."
        : "No portal você acompanha o andamento, conclui as tarefas que são sua responsabilidade e conversa com a equipe.";
      const pwHint = team
        ? "Recomendamos trocar a senha no primeiro acesso."
        : "Recomendamos trocar a senha no primeiro acesso (botão “Alterar senha” no portal).";

      const text = [
        `Olá, ${firstName}!`,
        "",
        `${who}${fromOrg} convidou você ${team ? "para entrar" : ""}${team ? " " : ""}${inviteTail} ${projectLabel} ${where}.`.replace(
          /\s+/g,
          " ",
        ),
        "",
        about,
        "",
        `Acesse: ${p.portalUrl}`,
        `E-mail: ${p.clientEmail}`,
        p.password
          ? `Senha: ${p.password}`
          : "Senha: use a senha que você já tem (ou clique em “Esqueci a senha”).",
        "",
        ...(p.password ? [pwHint, ""] : []),
        "Qualquer dúvida, é só responder este e-mail.",
        "",
        senderName ?? "",
        ...(orgName && senderName !== orgName ? [orgName] : []),
      ].join("\n");

      const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0f2b4c;color:#ffffff;padding:20px 28px;font-size:18px;font-weight:bold">${h(orgName || (team ? "Core" : "Portal do cliente"))}</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 14px;font-size:16px">Olá, ${h(firstName)}!</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${h(who)}${h(fromOrg)} convidou você ${team ? "para entrar " : ""}${h(inviteTail)} <strong>${h(projectLabel)}</strong> ${h(where)}.</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">${h(about)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="background:#f4f5f7;border-radius:8px;width:100%;margin:0 0 20px"><tr><td style="padding:16px 18px;font-size:14px;line-height:1.8">
<strong>E-mail:</strong> ${h(p.clientEmail)}<br>
${
  p.password
    ? `<strong>Senha:</strong> <span style="font-family:Consolas,Menlo,monospace;font-size:15px">${h(p.password)}</span>`
    : "<strong>Senha:</strong> use a senha que você já tem (ou “Esqueci a senha”)."
}
</td></tr></table>
<p style="margin:0 0 22px"><a href="${h(p.portalUrl)}" style="display:inline-block;background:#0f2b4c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:15px">${team ? "Acessar o projeto no Core" : "Acessar o portal do projeto"}</a></p>
<p style="margin:0 0 6px;font-size:12px;color:#6b7280">Se o botão não abrir, copie este endereço: ${h(p.portalUrl)}</p>
${p.password ? `<p style="margin:0 0 6px;font-size:12px;color:#6b7280">${h(pwHint)}</p>` : ""}
<p style="margin:18px 0 0;font-size:14px">Qualquer dúvida, é só responder este e-mail.<br><br>${h(senderName ?? "")}${orgName && senderName !== orgName ? `<br>${h(orgName)}` : ""}</p>
</td></tr></table></td></tr></table></body></html>`;

      return { subject, text, html };
    },
  });
}
