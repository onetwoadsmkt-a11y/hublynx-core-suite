// Server-only — leitura/escrita das contas IMAP/SMTP e das senhas criptografadas.
// A senha jamais sai daqui em texto puro para o cliente.
import { encryptConnectionKey, decryptConnectionKey } from "./connectionKeyCrypto";
import type { Security } from "./mailConnectionTest.server";

export type MailAccountRow = {
  id: string;
  empresa_id: string;
  provider: string;
  display_name: string | null;
  email: string;
  imap_host: string;
  imap_port: number;
  imap_security: Security;
  imap_username: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: Security;
  smtp_username: string;
  smtp_auth: boolean;
  status: "conectado" | "nao_conectado" | "erro";
  last_error: string | null;
  last_tested_at: string | null;
  updated_at: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

export async function getAccount(empresaId: string): Promise<MailAccountRow | null> {
  const db = await admin();
  const { data } = await db
    .from("mail_accounts")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("provider", "imap_smtp")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as MailAccountRow) ?? null;
}

export async function upsertAccount(
  empresaId: string,
  input: Omit<MailAccountRow, "id" | "empresa_id" | "provider" | "status" | "last_error" | "last_tested_at" | "updated_at"> & {
    password?: string | null;
  },
): Promise<MailAccountRow> {
  const db = await admin();
  const { password, ...fields } = input;
  const existing = await getAccount(empresaId);

  let row: MailAccountRow;
  if (existing) {
    const { data, error } = await db
      .from("mail_accounts")
      .update(fields)
      .eq("id", existing.id)
      .eq("empresa_id", empresaId)
      .select("*")
      .single();
    if (error) throw new Error("Não foi possível salvar a configuração de e-mail.");
    row = data as MailAccountRow;
  } else {
    if (!password) throw new Error("Informe a senha da conta de e-mail.");
    const { data, error } = await db
      .from("mail_accounts")
      .insert({ ...fields, empresa_id: empresaId, provider: "imap_smtp" })
      .select("*")
      .single();
    if (error) throw new Error("Não foi possível salvar a configuração de e-mail.");
    row = data as MailAccountRow;
  }

  if (password) {
    await db
      .from("mail_account_secrets")
      .upsert(
        { account_id: row.id, password_encrypted: encryptConnectionKey(password), updated_at: new Date().toISOString() },
        { onConflict: "account_id" },
      );
  }
  return row;
}

export async function getAccountPassword(accountId: string): Promise<string | null> {
  const db = await admin();
  const { data } = await db
    .from("mail_account_secrets")
    .select("password_encrypted")
    .eq("account_id", accountId)
    .maybeSingle();
  if (!data?.password_encrypted) return null;
  return decryptConnectionKey(data.password_encrypted as string);
}

/** Credenciais completas para uso interno futuro (sync IMAP, envio SMTP). */
export async function getMailCredentials(empresaId: string) {
  const account = await getAccount(empresaId);
  if (!account) return null;
  const password = await getAccountPassword(account.id);
  if (!password) return null;
  return { account, password };
}

export async function setAccountStatus(
  accountId: string,
  status: MailAccountRow["status"],
  lastError: string | null,
) {
  const db = await admin();
  await db
    .from("mail_accounts")
    .update({ status, last_error: lastError, last_tested_at: new Date().toISOString() })
    .eq("id", accountId);
}

export async function deleteAccount(empresaId: string, accountId: string) {
  const db = await admin();
  await db.from("mail_accounts").delete().eq("id", accountId).eq("empresa_id", empresaId);
}
