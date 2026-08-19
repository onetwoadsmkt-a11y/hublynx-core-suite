ALTER TABLE public.finances
  ADD COLUMN IF NOT EXISTS repasse_origem_id uuid REFERENCES public.finances(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_finances_repasse_origem ON public.finances(repasse_origem_id);