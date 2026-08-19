CREATE TABLE IF NOT EXISTS public.servicos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#22C55E',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicos TO authenticated;
GRANT ALL ON public.servicos TO service_role;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage their service lines" ON public.servicos;
CREATE POLICY "Owners manage their service lines" ON public.servicos FOR ALL TO authenticated
  USING (empresa_id = auth.uid()) WITH CHECK (empresa_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS servicos_empresa_nome_idx ON public.servicos (empresa_id, lower(nome));

DROP TRIGGER IF EXISTS servicos_updated_at ON public.servicos;
CREATE TRIGGER servicos_updated_at BEFORE UPDATE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS servico_id uuid REFERENCES public.servicos(id) ON DELETE SET NULL;
ALTER TABLE public.finances ADD COLUMN IF NOT EXISTS servico_id uuid REFERENCES public.servicos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS projects_servico_id_idx ON public.projects (servico_id);
CREATE INDEX IF NOT EXISTS finances_servico_id_idx ON public.finances (servico_id);

INSERT INTO public.servicos (empresa_id, nome)
SELECT DISTINCT p.owner_id, btrim(COALESCE(NULLIF(btrim(p.service_type), ''), p.name))
FROM public.projects p
WHERE COALESCE(NULLIF(btrim(p.service_type), ''), p.name) IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.projects p
SET servico_id = s.id
FROM public.servicos s
WHERE p.servico_id IS NULL
  AND s.empresa_id = p.owner_id
  AND lower(s.nome) = lower(btrim(COALESCE(NULLIF(btrim(p.service_type), ''), p.name)));

UPDATE public.finances f
SET servico_id = p.servico_id
FROM public.projects p
WHERE f.servico_id IS NULL AND f.project_id = p.id AND p.servico_id IS NOT NULL;