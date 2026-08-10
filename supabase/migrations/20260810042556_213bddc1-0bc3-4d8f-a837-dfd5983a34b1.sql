CREATE TABLE public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#00D084',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipelines TO authenticated;
GRANT ALL ON public.pipelines TO service_role;

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pipelines" ON public.pipelines
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER update_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pipeline_stages
  ADD COLUMN pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE CASCADE;

-- migrate existing stages into a default pipeline per owner
INSERT INTO public.pipelines (owner_id, name, position)
SELECT DISTINCT owner_id, 'Pipeline principal', 0
FROM public.pipeline_stages
WHERE pipeline_id IS NULL;

UPDATE public.pipeline_stages s
SET pipeline_id = p.id
FROM public.pipelines p
WHERE s.pipeline_id IS NULL
  AND p.owner_id = s.owner_id
  AND p.name = 'Pipeline principal';

CREATE INDEX idx_pipeline_stages_pipeline ON public.pipeline_stages(pipeline_id);