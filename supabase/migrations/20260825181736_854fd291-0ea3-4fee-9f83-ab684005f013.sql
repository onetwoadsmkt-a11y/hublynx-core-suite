-- 1. kanban_columns owner scoping
ALTER TABLE public.kanban_columns ADD COLUMN IF NOT EXISTS owner_id uuid;
UPDATE public.kanban_columns SET owner_id = COALESCE(
  (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY id LIMIT 1),
  (SELECT id FROM auth.users ORDER BY created_at LIMIT 1)
) WHERE owner_id IS NULL;
DELETE FROM public.kanban_columns WHERE owner_id IS NULL;
ALTER TABLE public.kanban_columns ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.kanban_columns ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.kanban_columns DROP CONSTRAINT IF EXISTS kanban_columns_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS kanban_columns_owner_key_uidx ON public.kanban_columns (owner_id, key);

DROP POLICY IF EXISTS "Authenticated users can delete kanban columns" ON public.kanban_columns;
DROP POLICY IF EXISTS "Authenticated users can insert kanban columns" ON public.kanban_columns;
DROP POLICY IF EXISTS "Authenticated users can update kanban columns" ON public.kanban_columns;
DROP POLICY IF EXISTS "Authenticated users can view kanban columns" ON public.kanban_columns;
CREATE POLICY "Owners manage their kanban columns" ON public.kanban_columns
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- 2. google_sheets_sync owner scoping
ALTER TABLE public.google_sheets_sync ADD COLUMN IF NOT EXISTS owner_id uuid;
UPDATE public.google_sheets_sync SET owner_id = COALESCE(
  (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY id LIMIT 1),
  (SELECT id FROM auth.users ORDER BY created_at LIMIT 1)
) WHERE owner_id IS NULL;
DELETE FROM public.google_sheets_sync WHERE owner_id IS NULL;
ALTER TABLE public.google_sheets_sync ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.google_sheets_sync ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.google_sheets_sync DROP CONSTRAINT IF EXISTS google_sheets_sync_pkey;
ALTER TABLE public.google_sheets_sync ADD PRIMARY KEY (owner_id, entity_type);

DROP POLICY IF EXISTS "Authenticated users can delete sheets sync" ON public.google_sheets_sync;
DROP POLICY IF EXISTS "Authenticated users can insert sheets sync" ON public.google_sheets_sync;
DROP POLICY IF EXISTS "Authenticated users can update sheets sync" ON public.google_sheets_sync;
DROP POLICY IF EXISTS "Authenticated users can view sheets sync" ON public.google_sheets_sync;
CREATE POLICY "Owners manage their sheets sync" ON public.google_sheets_sync
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- 3. Revoke direct EXECUTE on SECURITY DEFINER functions from API roles
REVOKE ALL ON FUNCTION public.tg_lead_file_journey() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_lead_task_journey() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_lead_journey() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_lead_note_journey() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_task_checklist_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_task_attachment_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_task_comment_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_tasks_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_baixas_recalc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_finance_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;