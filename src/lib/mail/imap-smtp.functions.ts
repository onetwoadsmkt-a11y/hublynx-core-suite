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
    const { getAccount, getAccountPassword, setAccountStatus } = await import(
      "@/server/mailAccounts.server"
    );
    const { testImapConnection, testSmtpConnection } = await import(
      "@/server/mailConnectionTest.server"
    );

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
        ok ? null : [imap, smtp].filter((r) => !r.ok).map((r) => r.message).join(" • "),
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
