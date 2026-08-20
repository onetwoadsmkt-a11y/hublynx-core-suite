CREATE TABLE public.mail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'imap_smtp',
  display_name text,
  email text NOT NULL,
  imap_host text NOT NULL,
  imap_port integer NOT NULL DEFAULT 993,
  imap_security text NOT NULL DEFAULT 'ssl',
  imap_username text NOT NULL,
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL DEFAULT 465,
  smtp_security text NOT NULL DEFAULT 'ssl',
  smtp_username text NOT NULL,
  smtp_auth boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'nao_conectado',
  last_error text,
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_accounts_imap_sec_chk CHECK (imap_security IN ('ssl','starttls','none')),
  CONSTRAINT mail_accounts_smtp_sec_chk CHECK (smtp_security IN ('ssl','starttls','none')),
  CONSTRAINT mail_accounts_status_chk CHECK (status IN ('conectado','nao_conectado','erro'))
);

CREATE UNIQUE INDEX mail_accounts_empresa_email_idx ON public.mail_accounts (empresa_id, lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_accounts TO authenticated;
GRANT ALL ON public.mail_accounts TO service_role;
ALTER TABLE public.mail_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mail_accounts_own" ON public.mail_accounts
  FOR ALL TO authenticated
  USING (empresa_id = auth.uid())
  WITH CHECK (empresa_id = auth.uid());

CREATE TRIGGER mail_accounts_set_updated_at
  BEFORE UPDATE ON public.mail_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.mail_account_secrets (
  account_id uuid PRIMARY KEY REFERENCES public.mail_accounts(id) ON DELETE CASCADE,
  password_encrypted text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.mail_account_secrets TO service_role;
ALTER TABLE public.mail_account_secrets ENABLE ROW LEVEL SECURITY;