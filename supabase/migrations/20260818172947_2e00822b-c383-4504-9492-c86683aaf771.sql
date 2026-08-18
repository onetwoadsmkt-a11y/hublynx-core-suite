DROP VIEW public.google_connections_public;

CREATE VIEW public.google_connections_public
WITH (security_invoker = true) AS
SELECT user_id, google_email, scopes, status, expires_at, last_error, updated_at
FROM public.google_connections;

-- Grants por coluna: tokens jamais são acessíveis ao usuário
GRANT SELECT (user_id, google_email, scopes, status, expires_at, last_error, updated_at)
  ON public.google_connections TO authenticated;
GRANT SELECT ON public.google_connections_public TO authenticated;

CREATE POLICY "Users can read their own google connection"
  ON public.google_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);