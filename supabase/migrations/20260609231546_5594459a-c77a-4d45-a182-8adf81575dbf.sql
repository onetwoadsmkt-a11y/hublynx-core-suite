
DROP TRIGGER IF EXISTS tg_tasks_history ON public.tasks;
CREATE TRIGGER tg_tasks_history
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_history();
