-- Add search_path to the BEFORE INSERT helper
CREATE OR REPLACE FUNCTION public.tg_tasks_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;

-- Revoke public/authenticated EXECUTE on trigger functions (they only run via triggers)
REVOKE EXECUTE ON FUNCTION public.tg_tasks_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_task_checklist_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_task_attachment_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_task_comment_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_tasks_set_created_by() FROM PUBLIC, anon, authenticated;