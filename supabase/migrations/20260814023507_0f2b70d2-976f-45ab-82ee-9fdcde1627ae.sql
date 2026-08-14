CREATE TABLE public.google_oauth_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id text NOT NULL,
  action text NOT NULL,
  status text NOT NULL,
  message text,
  account_email text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX google_oauth_logs_user_created_idx ON public.google_oauth_logs (user_id, created_at DESC);
GRANT SELECT ON public.google_oauth_logs TO authenticated;
GRANT ALL ON public.google_oauth_logs TO service_role;
ALTER TABLE public.google_oauth_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs readable" ON public.google_oauth_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all logs" ON public.google_oauth_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));