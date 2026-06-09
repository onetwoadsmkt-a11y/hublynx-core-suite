CREATE TABLE public.user_google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_api_key text NOT NULL,
  email text,
  scopes text[] NOT NULL DEFAULT '{}',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_google_connections TO authenticated;
GRANT ALL ON public.user_google_connections TO service_role;
ALTER TABLE public.user_google_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_google_connection" ON public.user_google_connections
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tg_user_google_connections_updated
  BEFORE UPDATE ON public.user_google_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();