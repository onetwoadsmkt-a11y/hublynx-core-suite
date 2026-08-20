// Server-only — teste real de conexão IMAP e SMTP.
// Mensagens de retorno nunca contêm credenciais.
import { openMailSocket, createLineReader } from "./mailSocket.server";

export type Security = "ssl" | "starttls" | "none";

export type TestResult = { protocol: "imap" | "smtp"; ok: boolean; message: string };

function friendlyError(err: unknown, protocol: "imap" | "smtp"): string {
  const raw = String((err as Error)?.message ?? err ?? "");
  const nome = protocol === "imap" ? "IMAP" : "SMTP";
  if (/timeout/i.test(raw)) return `Tempo esgotado ao conectar no servidor ${nome}.`;
  if (/certificate|self.signed|CERT_|ssl|tls/i.test(raw))
    return "Certificado SSL/TLS inválido.";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|hostname/i.test(raw))
    return "Servidor ou porta inválidos.";
  if (/ECONNREFUSED|ECONNRESET|closed|EHOSTUNREACH|ENETUNREACH|refused/i.test(raw))
    return `Não foi possível conectar ao servidor ${nome}.`;
  return `Não foi possível conectar ao servidor ${nome}.`;
}

function imapQuote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export type ImapParams = {
  host: string;
  port: number;
  security: Security;
  username: string;
  password: string;
};

export async function testImapConnection(p: ImapParams): Promise<TestResult> {
  let socket;
  try {
    socket = await openMailSocket(p.host, p.port, p.security === "ssl");
  } catch (err) {
    return { protocol: "imap", ok: false, message: friendlyError(err, "imap") };
  }
  const lines = createLineReader(socket);
  try {
    const greeting = await lines.until((l) => /^\*\s+(OK|PREAUTH|BYE)/i.test(l));
    if (/^\*\s+BYE/im.test(greeting))
      return { protocol: "imap", ok: false, message: "O servidor IMAP recusou a conexão." };

    if (p.security === "starttls") {
      await socket.write("a0 STARTTLS\r\n");
      const res = await lines.until((l) => /^a0 /i.test(l));
      if (!/^a0 OK/im.test(res))
        return { protocol: "imap", ok: false, message: "O servidor IMAP não aceitou STARTTLS." };
      await socket.startTls();
      lines.reset();
    }

    await socket.write(`a1 LOGIN ${imapQuote(p.username)} ${imapQuote(p.password)}\r\n`);
    const login = await lines.until((l) => /^a1 /i.test(l));
    if (/^a1 OK/im.test(login)) {
      await socket.write("a2 LOGOUT\r\n").catch(() => {});
      return { protocol: "imap", ok: true, message: "IMAP conectado com sucesso" };
    }
    return {
      protocol: "imap",
      ok: false,
      message: "Não foi possível autenticar no servidor IMAP",
    };
  } catch (err) {
    return { protocol: "imap", ok: false, message: friendlyError(err, "imap") };
  } finally {
    await socket.close().catch(() => {});
  }
}

export type SmtpParams = {
  host: string;
  port: number;
  security: Security;
  username: string;
  password: string;
  auth: boolean;
};

async function smtpCommand(
  socket: Awaited<ReturnType<typeof openMailSocket>>,
  lines: ReturnType<typeof createLineReader>,
  command: string | null,
): Promise<{ code: number; text: string }> {
  if (command !== null) await socket.write(`${command}\r\n`);
  const block = await lines.until((l) => /^\d{3}(\s|$)/.test(l));
  const last = block.split("\n").filter((l) => /^\d{3}/.test(l)).pop() ?? "";
  return { code: Number(last.slice(0, 3)) || 0, text: block };
}

export async function testSmtpConnection(p: SmtpParams): Promise<TestResult> {
  let socket;
  try {
    socket = await openMailSocket(p.host, p.port, p.security === "ssl");
  } catch (err) {
    return { protocol: "smtp", ok: false, message: friendlyError(err, "smtp") };
  }
  const lines = createLineReader(socket);
  try {
    const hello = await smtpCommand(socket, lines, null);
    if (hello.code !== 220)
      return { protocol: "smtp", ok: false, message: "O servidor SMTP recusou a conexão." };

    let ehlo = await smtpCommand(socket, lines, "EHLO hublynx.local");
    if (ehlo.code >= 400) ehlo = await smtpCommand(socket, lines, "HELO hublynx.local");
    if (ehlo.code >= 400)
      return { protocol: "smtp", ok: false, message: "O servidor SMTP recusou a apresentação." };

    if (p.security === "starttls") {
      const st = await smtpCommand(socket, lines, "STARTTLS");
      if (st.code !== 220)
        return { protocol: "smtp", ok: false, message: "O servidor SMTP não aceitou STARTTLS." };
      await socket.startTls();
      lines.reset();
      const again = await smtpCommand(socket, lines, "EHLO hublynx.local");
      if (again.code >= 400)
        return { protocol: "smtp", ok: false, message: "Falha na negociação TLS com o SMTP." };
    }

    if (p.auth) {
      const start = await smtpCommand(socket, lines, "AUTH LOGIN");
      if (start.code !== 334)
        return {
          protocol: "smtp",
          ok: false,
          message: "O servidor SMTP não aceitou autenticação por usuário e senha.",
        };
      const user = await smtpCommand(socket, lines, btoa(p.username));
      if (user.code !== 334)
        return {
          protocol: "smtp",
          ok: false,
          message: "Não foi possível autenticar no servidor SMTP",
        };
      const pass = await smtpCommand(socket, lines, btoa(p.password));
      if (pass.code !== 235)
        return {
          protocol: "smtp",
          ok: false,
          message: "Não foi possível autenticar no servidor SMTP",
        };
    }

    await socket.write("QUIT\r\n").catch(() => {});
    return { protocol: "smtp", ok: true, message: "SMTP conectado com sucesso" };
  } catch (err) {
    return { protocol: "smtp", ok: false, message: friendlyError(err, "smtp") };
  } finally {
    await socket.close().catch(() => {});
  }
}
