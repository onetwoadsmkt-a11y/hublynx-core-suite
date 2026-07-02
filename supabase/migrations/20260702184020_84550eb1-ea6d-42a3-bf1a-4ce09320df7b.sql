
CREATE TABLE public.user_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_slug text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  installed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_modules TO authenticated;
GRANT ALL ON public.user_modules TO service_role;

ALTER TABLE public.user_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_user_modules ON public.user_modules
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER user_modules_set_updated_at
  BEFORE UPDATE ON public.user_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
