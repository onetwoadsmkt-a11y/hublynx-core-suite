
-- Extend projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#6366f1';

-- Link finances to projects
ALTER TABLE public.finances
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- Milestones
CREATE TABLE IF NOT EXISTS public.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending', -- pending | in_progress | done
  due_date date,
  position integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_milestones TO authenticated;
GRANT ALL ON public.project_milestones TO service_role;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own milestones" ON public.project_milestones FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_milestones_updated BEFORE UPDATE ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Members
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own members" ON public.project_members FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Risks
CREATE TABLE IF NOT EXISTS public.project_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium', -- low | medium | high | critical
  status text NOT NULL DEFAULT 'open', -- open | mitigated | resolved
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_risks TO authenticated;
GRANT ALL ON public.project_risks TO service_role;
ALTER TABLE public.project_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own risks" ON public.project_risks FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_risks_updated BEFORE UPDATE ON public.project_risks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notes
CREATE TABLE IF NOT EXISTS public.project_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  content_html text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_notes TO authenticated;
GRANT ALL ON public.project_notes TO service_role;
ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own notes" ON public.project_notes FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_notes_updated BEFORE UPDATE ON public.project_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Costs
CREATE TABLE IF NOT EXISTS public.project_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'internal', -- internal | external
  category text,
  description text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  incurred_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_costs TO authenticated;
GRANT ALL ON public.project_costs TO service_role;
ALTER TABLE public.project_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own costs" ON public.project_costs FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_costs_updated BEFORE UPDATE ON public.project_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Activity
CREATE TABLE IF NOT EXISTS public.project_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_activity TO authenticated;
GRANT ALL ON public.project_activity TO service_role;
ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own activity" ON public.project_activity FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_project_activity_project ON public.project_activity(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON public.project_milestones(project_id, position);
CREATE INDEX IF NOT EXISTS idx_project_costs_project ON public.project_costs(project_id, incurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_risks_project ON public.project_risks(project_id, severity);
CREATE INDEX IF NOT EXISTS idx_finances_project ON public.finances(project_id);
