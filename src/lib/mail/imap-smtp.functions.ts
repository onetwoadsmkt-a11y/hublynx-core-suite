import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const security = z.enum(["ssl", "starttls", "none"]);

const accountSchema = z.object({
  displayName: z.string().trim().max(120).nullish(),
  email: z.string().trim().email().max(200),
  imapHost: z.string().trim().min(3).max(200),
  imapPort: z.number().int().min(1).max(65535),
  imapSecurity: security,
  imapUsername: z.string().trim().min(1).max(200),
  smtpHost: z.string().trim().min(3).max(200),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecurity: security,
  smtpUsername: z.string().trim().min(1).max(200),
  smtpAuth: z.boolean(),
  password: z.string().max(500).nullish(),
});

/** Configuração da conta — nunca devolve senha. */
export const getMyMailAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAccount, getAccountPassword } = await import("@/server/mailAccounts.server");
    const account = await getAccount(context.userId);
    if (!account) return { account: null as null };
    const hasPassword = !!(await getAccountPassword(account.id));
    return {
      account: {
        id: account.id,
        displayName: account.display_name,
        email: account.email,
        imapHost: account.imap_host,
        imapPort: account.imap_port,
        imapSecurity: account.imap_security,
        imapUsername: account.imap_username,
        smtpHost: account.smtp_host,
        smtpPort: account.smtp_port,
        smtpSecurity: account.smtp_security,
        smtpUsername: account.smtp_username,
        smtpAuth: account.smtp_auth,
        status: account.status,
        lastError: account.last_error,
        lastTestedAt: account.last_tested_at,
        hasPassword,
      },
    };
  });

export const saveMyMailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => accountSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { upsertAccount } = await import("@/server/mailAccounts.server");
    const row = await upsertAccount(context.userId, {
      display_name: data.displayName ?? null,
      email: data.email,
      imap_host: data.imapHost,
      imap_port: data.imapPort,
      imap_security: data.imapSecurity,
      imap_username: data.imapUsername,
      smtp_host: data.smtpHost,
      smtp_port: data.smtpPort,
      smtp_security: data.smtpSecurity,
      smtp_username: data.smtpUsername,
      smtp_auth: data.smtpAuth,
      password: data.password || null,
    });
    return { ok: true as const, id: row.id };
  });

/** Testa IMAP e SMTP no backend. Usa a senha do formulário ou a já salva. */
export const testMyMailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => accountSchema.partial({ password: true }).parse(d))
  .handler(async ({ data, context }) => {
    const { getAccount, getAccountPassword, setAccountStatus } =
      await import("@/server/mailAccounts.server");
    const { testImapConnection, testSmtpConnection } =
      await import("@/server/mailConnectionTest.server");

    let password = data.password || "";
    if (!password) {
      const account = await getAccount(context.userId);
      password = account ? ((await getAccountPassword(account.id)) ?? "") : "";
    }
    if (!password) {
      return {
        results: [
          { protocol: "imap" as const, ok: false, message: "Informe a senha da conta de e-mail." },
          { protocol: "smtp" as const, ok: false, message: "Informe a senha da conta de e-mail." },
        ],
      };
    }

    const imap = await testImapConnection({
      host: data.imapHost,
      port: data.imapPort,
      security: data.imapSecurity,
      username: data.imapUsername,
      password,
    });
    const smtp = await testSmtpConnection({
      host: data.smtpHost,
      port: data.smtpPort,
      security: data.smtpSecurity,
      username: data.smtpUsername,
      password,
      auth: data.smtpAuth,
    });

    const existing = await getAccount(context.userId);
    if (existing) {
      const ok = imap.ok && smtp.ok;
      await setAccountStatus(
        existing.id,
        ok ? "conectado" : "erro",
        ok
          ? null
          : [imap, smtp]
              .filter((r) => !r.ok)
              .map((r) => r.message)
              .join(" • "),
      );
    }
    return { results: [imap, smtp] };
  });

export const disconnectMyMailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAccount, deleteAccount } = await import("@/server/mailAccounts.server");
    const account = await getAccount(context.userId);
    if (account) await deleteAccount(context.userId, account.id);
    return { ok: true as const };
  });

export type MailSuggestion = {
  provider: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: "ssl" | "starttls" | "none";
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "ssl" | "starttls" | "none";
  note: string | null;
};

/**
 * Sugere servidor e portas pelo domínio do e-mail (registro MX).
 * Provedores conhecidos têm configuração própria; hospedagens cPanel (i7host,
 * HostGator, KingHost...) usam o próprio servidor de e-mail com IMAP 993 SSL e
 * SMTP 465 SSL — o nome do servidor bate com o certificado, ao contrário de
 * "mail.dominio", que muitas vezes não tem certificado válido.
 */
export const suggestMailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().email().max(200) }).parse(d))
  .handler(async ({ data }): Promise<MailSuggestion | null> => {
    const domain = data.email.split("@")[1]?.toLowerCase() ?? "";
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
    const ssl = (
      provider: string,
      imapHost: string,
      smtpHost: string,
      note: string | null = null,
    ) => ({
      provider,
      imapHost,
      imapPort: 993,
      imapSecurity: "ssl" as const,
      smtpHost,
      smtpPort: 465,
      smtpSecurity: "ssl" as const,
      note,
    });
    if (domain === "gmail.com" || domain === "googlemail.com")
      return ssl(
        "Gmail",
        "imap.gmail.com",
        "smtp.gmail.com",
        "Use uma senha de app do Google (com verificação em duas etapas ligada).",
      );
    if (/^(outlook|hotmail|live)\.com(\.br)?$/.test(domain))
      return {
        ...ssl("Outlook", "outlook.office365.com", "smtp-mail.outlook.com"),
        smtpPort: 587,
        smtpSecurity: "starttls",
      };

    let mx: string[] = [];
    try {
      const res = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
        {
          headers: { accept: "application/dns-json" },
        },
      );
      const json = (await res.json()) as { Answer?: { type: number; data: string }[] };
      mx = (json.Answer ?? [])
        .filter((a) => a.type === 15)
        .map((a) => a.data.trim().split(/\s+/))
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map((p) => (p[1] ?? "").replace(/\.$/, "").toLowerCase())
        .filter(Boolean);
    } catch {
      /* sem DNS: tenta o padrão abaixo */
    }
    const first = mx[0] ?? "";
    const any = (re: RegExp) => mx.some((h) => re.test(h));
    if (any(/google\.com$|googlemail\.com$/))
      return ssl(
        "Google Workspace",
        "imap.gmail.com",
        "smtp.gmail.com",
        "Use uma senha de app do Google (com verificação em duas etapas ligada).",
      );
    if (any(/outlook\.com$|protection\.outlook\.com$/))
      return {
        ...ssl(
          "Microsoft 365",
          "outlook.office365.com",
          "smtp.office365.com",
          "O administrador do Microsoft 365 precisa permitir SMTP autenticado nesta caixa.",
        ),
        smtpPort: 587,
        smtpSecurity: "starttls",
      };
    if (any(/zoho\./)) return ssl("Zoho Mail", "imap.zoho.com", "smtp.zoho.com");
    if (any(/hostinger/)) return ssl("Hostinger", "imap.hostinger.com", "smtp.hostinger.com");
    if (any(/locaweb/))
      return { ...ssl("Locaweb", "email-ssl.com.br", "email-ssl.com.br"), smtpPort: 465 };
    if (any(/titan\.email$/)) return ssl("Titan", "imap.titan.email", "smtp.titan.email");
    if (first) {
      const hosting = /i7host/.test(first) ? "i7host (cPanel)" : "hospedagem própria";
      return ssl(
        hosting,
        first,
        first,
        "Usuário: o e-mail completo. Se a porta 465 não conectar, use 587 com STARTTLS no envio.",
      );
    }
    return ssl(
      "padrão",
      `mail.${domain}`,
      `mail.${domain}`,
      "Confirme o servidor com a sua hospedagem.",
    );
  });
