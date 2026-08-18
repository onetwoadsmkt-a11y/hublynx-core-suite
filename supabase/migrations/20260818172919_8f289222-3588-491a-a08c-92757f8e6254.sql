-- Config OAuth do Google (linha única, acesso exclusivo do backend)
CREATE TABLE public.google_oauth_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  client_id text,
  client_secret text,
  enabled_scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT ALL ON public.google_oauth_config TO service_role;
ALTER TABLE public.google_oauth_config ENABLE ROW LEVEL SECURITY;

-- Conexões Google por usuário (tokens nunca expostos ao cliente)
CREATE TABLE public.google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'connected',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.google_connections TO service_role;
ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_google_connections_updated
BEFORE UPDATE ON public.google_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- View pública: apenas colunas não sensíveis, apenas a própria linha
CREATE VIEW public.google_connections_public
WITH (security_invoker = false) AS
SELECT user_id, google_email, scopes, status, expires_at, last_error, updated_at
FROM public.google_connections
WHERE user_id = auth.uid();
GRANT SELECT ON public.google_connections_public TO authenticated;

-- States de OAuth (uso interno)
CREATE TABLE public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;