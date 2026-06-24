
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_config (key, value) VALUES (
  'vapid',
  jsonb_build_object(
    'publicKey', 'BHz072_ymL_bepOWx0a0KO6xHbfQjXpQs87gJdQ2liUYKJbBkQLyy5bHF138yyowcW_YeHhkz4butdMOgbG1Ixo',
    'privateKey', 'eAej9RblyxHqAbTZYO3PLSzeL_JXWCrLaI7roFK_C8g',
    'subject', 'mailto:hublynx.dev@gmail.com'
  )
) ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.task_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_task_push_log_task ON public.task_push_log(task_id);
GRANT SELECT ON public.task_push_log TO authenticated;
GRANT ALL ON public.task_push_log TO service_role;
ALTER TABLE public.task_push_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own push log"
  ON public.task_push_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
