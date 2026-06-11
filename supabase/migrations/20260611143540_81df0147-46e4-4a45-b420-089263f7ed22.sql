
-- 1. is_admin helper
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'admin'::app_role) $$;

-- 2. Promote hublynx.dev@gmail.com if already signed up
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'hublynx.dev@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Auto-promote on signup: extend handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN NEW.email = 'hublynx.dev@gmail.com' THEN 'admin'::app_role ELSE 'user'::app_role END);
  RETURN NEW;
END; $$;

-- 4. Admin override policies on key tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','user_roles','projects','tasks','clients','finances','events',
                            'project_members','project_milestones','project_risks','project_costs',
                            'project_notes','project_activity','task_comments','task_checklists',
                            'task_attachments','task_history','notifications','files']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage all" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Admins manage all" ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t);
  END LOOP;
END $$;
