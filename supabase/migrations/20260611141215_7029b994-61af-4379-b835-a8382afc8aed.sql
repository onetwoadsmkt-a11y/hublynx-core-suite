
CREATE OR REPLACE FUNCTION public.tg_task_attachment_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.tasks WHERE id = NEW.task_id) THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, new_value)
      VALUES (NEW.task_id, NEW.owner_id, v_actor, 'file_uploaded', 'attachment', NEW.name);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.tasks WHERE id = OLD.task_id) THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, old_value)
      VALUES (OLD.task_id, OLD.owner_id, v_actor, 'file_deleted', 'attachment', OLD.name);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_task_checklist_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.tasks WHERE id = NEW.task_id) THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, new_value)
      VALUES (NEW.task_id, NEW.owner_id, v_actor, 'checklist_added', 'checklist', NEW.label);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.done IS DISTINCT FROM OLD.done THEN
    IF EXISTS (SELECT 1 FROM public.tasks WHERE id = NEW.task_id) THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, new_value)
      VALUES (NEW.task_id, NEW.owner_id, v_actor,
              CASE WHEN NEW.done THEN 'checklist_done' ELSE 'checklist_undone' END,
              'checklist', NEW.label);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.tasks WHERE id = OLD.task_id) THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, old_value)
      VALUES (OLD.task_id, OLD.owner_id, v_actor, 'checklist_deleted', 'checklist', OLD.label);
    END IF;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.tg_task_comment_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_task RECORD;
  v_uid uuid;
BEGIN
  SELECT title, owner_id INTO v_task FROM public.tasks WHERE id = NEW.task_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, new_value)
  VALUES (NEW.task_id, NEW.owner_id, v_actor, 'comment_added', 'comment', left(NEW.body, 280));

  IF NEW.mentions IS NOT NULL THEN
    FOREACH v_uid IN ARRAY NEW.mentions LOOP
      IF v_uid <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        INSERT INTO public.notifications(user_id, title, body, link)
        VALUES (v_uid, 'Você foi mencionado',
                'em "' || COALESCE(v_task.title, 'tarefa') || '"',
                '/tarefas?task=' || NEW.task_id::text);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
