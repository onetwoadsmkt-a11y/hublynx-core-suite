// Server-only — envio de e-mail pelo SMTP da conta conectada do usuário
// (Configurações → Integrações → E-mail IMAP/SMTP). Nunca expõe a senha.
import { openMailSocket, createLineReader } from "./mailSocket.server";
import { smtpCommand, friendlyError } from "./mailConnectionTest.server";
import type { MailAccountRow } from "./mailAccounts.server";

export type OutgoingMail = {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
};

const enc = new TextEncoder();

function b64(s: string) {
  let bin = "";
  for (const byte of enc.encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
}

/** Cabeçalho com acento (RFC 2047). */
function header(s: string) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
}

function address(email: string, name?: string | null) {
  const clean = (name ?? "").replace(/["\r\n<>]/g, "").trim();
  if (!clean) return `<${email}>`;
  return /^[\x20-\x7e]*$/.test(clean) ? `"${clean}" <${email}>` : `${header(clean)} <${email}>`;
}

function wrap76(s: string) {
  return s.replace(/.{1,76}/g, "$&\r\n");
}

export function buildMimeMessage(from: { email: string; name?: string | null }, m: OutgoingMail) {
  const boundary = `b_${crypto.randomUUID()}`;
  const domain = from.email.split("@")[1] || "hublynx.local";
  return [
    `From: ${address(from.email, from.name)}`,
    `To: ${address(m.to, m.toName)}`,
    ...(m.replyTo ? [`Reply-To: <${m.replyTo}>`] : []),
    `Subject: ${header(m.subject)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(m.text)),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(m.html)),
    `--${boundary}--`,
  ].join("\r\n");
}

type SmtpAccount = Pick<
  MailAccountRow,
  | "email"
  | "display_name"
  | "smtp_host"
  | "smtp_port"
  | "smtp_security"
  | "smtp_username"
  | "smtp_auth"
>;

/** Envia um e-mail pelo SMTP da conta. Lança erro com mensagem amigável. */
export async function sendSmtpMail(
  account: SmtpAccount,
  password: string,
  mail: OutgoingMail,
  fromName?: string | null,
): Promise<void> {
  let socket: Awaited<ReturnType<typeof openMailSocket>>;
  try {
    socket = await openMailSocket(
      account.smtp_host,
      account.smtp_port,
      account.smtp_security === "ssl",
    );
  } catch (err) {
    throw new Error(friendlyError(err, "smtp"));
  }
  const lines = createLineReader(socket);
  class SmtpError extends Error {}
  const expect = async (cmd: string | null, ok: number[], msg: string) => {
    const r = await smtpCommand(socket, lines, cmd);
    if (!ok.includes(r.code)) throw new SmtpError(msg);
    return r;
  };
  try {
    await expect(null, [220], "O servidor SMTP recusou a conexão.");
    const helo = `EHLO ${account.email.split("@")[1] || "hublynx.local"}`;
    await expect(helo, [250], "O servidor SMTP recusou a apresentação.");
    if (account.smtp_security === "starttls") {
      await expect("STARTTLS", [220], "O servidor SMTP não aceitou STARTTLS.");
      await socket.startTls();
      lines.reset();
      await expect(helo, [250], "Falha na negociação TLS com o SMTP.");
    }
    if (account.smtp_auth) {
      await expect("AUTH LOGIN", [334], "O servidor SMTP não aceitou usuário e senha.");
      await expect(b64(account.smtp_username), [334], "Não foi possível autenticar no SMTP.");
      await expect(
        b64(password),
        [235],
        "Não foi possível autenticar no SMTP. No Gmail, use uma senha de app.",
      );
    }
    await expect(`MAIL FROM:<${account.email}>`, [250], "O servidor SMTP recusou o remetente.");
    await expect(`RCPT TO:<${mail.to}>`, [250, 251], "O servidor SMTP recusou o destinatário.");
    await expect("DATA", [354], "O servidor SMTP não aceitou a mensagem.");
    // linhas que começam com "." são duplicadas (RFC 5321)
    const body = buildMimeMessage(
      { email: account.email, name: fromName ?? account.display_name },
      mail,
    )
      .split("\r\n")
      .map((l) => (l.startsWith(".") ? `.${l}` : l))
      .join("\r\n");
    await expect(`${body}\r\n.`, [250], "O servidor SMTP não confirmou o envio.");
    await socket.write("QUIT\r\n").catch(() => {});
  } catch (err) {
    if (err instanceof SmtpError) throw err;
    throw new Error(friendlyError(err, "smtp"));
  } finally {
    await socket.close().catch(() => {});
  }
}
