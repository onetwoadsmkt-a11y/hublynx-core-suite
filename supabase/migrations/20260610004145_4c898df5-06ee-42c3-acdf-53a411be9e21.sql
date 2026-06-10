CREATE TABLE public.task_communications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  actor_id uuid,
  kind text NOT NULL CHECK (kind IN ('email','meeting')),
  subject text,
  recipients text[] NOT NULL DEFAULT '{}',
  body_snippet text,
  provider_id text,
  meet_link text,
  start_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_communications_task_idx ON public.task_communications(task_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_communications TO authenticated;
GRANT ALL ON public.task_communications TO service_role;

ALTER TABLE public.task_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their task communications"
ON public.task_communications FOR ALL
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);