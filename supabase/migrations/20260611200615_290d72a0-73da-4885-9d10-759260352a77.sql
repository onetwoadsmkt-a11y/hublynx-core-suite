
ALTER TABLE public.finances
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_day smallint,
  ADD COLUMN IF NOT EXISTS recurrence_until date,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.finances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installment_no smallint,
  ADD COLUMN IF NOT EXISTS installment_total smallint;

CREATE INDEX IF NOT EXISTS idx_finances_owner_due ON public.finances(owner_id, due_date);
CREATE INDEX IF NOT EXISTS idx_finances_parent ON public.finances(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_finances_parent_due ON public.finances(parent_id, due_date) WHERE parent_id IS NOT NULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.finances;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.project_costs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_categories;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
