-- Lock down user_roles writes: explicit restrictive policies + correct grants.
-- Roles must only be assigned by trusted server-side code (service_role)
-- or the handle_new_user() SECURITY DEFINER trigger.

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

CREATE POLICY "Block role inserts from clients"
ON public.user_roles AS RESTRICTIVE
FOR INSERT TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "Block role updates from clients"
ON public.user_roles AS RESTRICTIVE
FOR UPDATE TO authenticated, anon
USING (false) WITH CHECK (false);

CREATE POLICY "Block role deletes from clients"
ON public.user_roles AS RESTRICTIVE
FOR DELETE TO authenticated, anon
USING (false);