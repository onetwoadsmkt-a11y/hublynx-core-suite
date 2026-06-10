
-- 1. Convert tasks.status enum to text
ALTER TABLE public.tasks ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.tasks ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'a_fazer';
DROP TYPE IF EXISTS public.task_status;

-- 2. Create kanban_columns table
CREATE TABLE public.kanban_columns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  tone text NOT NULL DEFAULT 'bg-muted text-muted-foreground',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_columns TO authenticated;
GRANT ALL ON public.kanban_columns TO service_role;

ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view kanban columns"
  ON public.kanban_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert kanban columns"
  ON public.kanban_columns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update kanban columns"
  ON public.kanban_columns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete kanban columns"
  ON public.kanban_columns FOR DELETE TO authenticated USING (true);

CREATE TRIGGER kanban_columns_updated_at
  BEFORE UPDATE ON public.kanban_columns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Seed default columns
INSERT INTO public.kanban_columns (key, label, tone, position) VALUES
  ('backlog', 'Backlog', 'bg-muted text-muted-foreground', 0),
  ('a_fazer', 'A fazer', 'bg-blue-100 text-blue-700', 1),
  ('em_andamento', 'Em andamento', 'bg-amber-100 text-amber-700', 2),
  ('revisao', 'Revisão', 'bg-indigo-100 text-indigo-700', 3),
  ('concluido', 'Concluído', 'bg-emerald-100 text-emerald-700', 4)
ON CONFLICT (key) DO NOTHING;
