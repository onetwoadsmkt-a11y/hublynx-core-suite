-- ============================================================
-- 1. Migrate task_status enum to 5 values
-- ============================================================
ALTER TYPE public.task_status RENAME TO task_status_old;
CREATE TYPE public.task_status AS ENUM ('backlog','a_fazer','em_andamento','revisao','concluido');

ALTER TABLE public.tasks ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.tasks
  ALTER COLUMN status TYPE public.task_status
  USING (
    CASE status::text
      WHEN 'planejado' THEN 'a_fazer'
      WHEN 'aguardando_cliente' THEN 'em_andamento'
      WHEN 'cancelado' THEN 'backlog'
      ELSE status::text
    END
  )::public.task_status;
ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'backlog'::public.task_status;
DROP TYPE public.task_status_old;

-- ============================================================
-- 2. Extra columns on tasks
-- ============================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_hours numeric,
  ADD COLUMN IF NOT EXISTS actual_hours numeric,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS briefing jsonb;

UPDATE public.tasks SET created_by = owner_id WHERE created_by IS NULL;

-- ============================================================
-- 3. Extra columns on task_comments
-- ============================================================
ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.task_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}';

-- ============================================================
-- 4. Resource type enum
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.task_resource_type AS ENUM ('task','project','client','event','file');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.custom_field_type AS ENUM ('text','number','date','select','url');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 5. task_labels
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#2563EB',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_labels TO authenticated;
GRANT ALL ON public.task_labels TO service_role;
ALTER TABLE public.task_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all task_labels" ON public.task_labels FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- 6. task_label_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_label_assignments (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.task_labels(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, label_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_label_assignments TO authenticated;
GRANT ALL ON public.task_label_assignments TO service_role;
ALTER TABLE public.task_label_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all task_label_assignments" ON public.task_label_assignments FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- 7. task_attachments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  name text NOT NULL,
  size bigint NOT NULL,
  mime text,
  storage_path text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_attachments TO authenticated;
GRANT ALL ON public.task_attachments TO service_role;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all task_attachments" ON public.task_attachments FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- 8. task_history
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  field text,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_history_task ON public.task_history(task_id, created_at DESC);
GRANT SELECT, INSERT ON public.task_history TO authenticated;
GRANT ALL ON public.task_history TO service_role;
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read task_history" ON public.task_history FOR SELECT
  USING (auth.uid() = owner_id);
CREATE POLICY "owner insert task_history" ON public.task_history FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- 9. task_custom_fields
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  type public.custom_field_type NOT NULL DEFAULT 'text',
  options jsonb,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_custom_fields TO authenticated;
GRANT ALL ON public.task_custom_fields TO service_role;
ALTER TABLE public.task_custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all task_custom_fields" ON public.task_custom_fields FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- 10. task_custom_values
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_custom_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.task_custom_fields(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, field_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_custom_values TO authenticated;
GRANT ALL ON public.task_custom_values TO service_role;
ALTER TABLE public.task_custom_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all task_custom_values" ON public.task_custom_values FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- 11. task_related
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_related (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  resource_type public.task_resource_type NOT NULL,
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, resource_type, resource_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_related TO authenticated;
GRANT ALL ON public.task_related TO service_role;
ALTER TABLE public.task_related ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all task_related" ON public.task_related FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- 12. History trigger on tasks
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_tasks_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_history(task_id, owner_id, actor_id, action)
    VALUES (NEW.id, NEW.owner_id, v_actor, 'task_created');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      VALUES (NEW.id, NEW.owner_id, v_actor, 'task_edited', 'title', OLD.title, NEW.title);
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      VALUES (NEW.id, NEW.owner_id, v_actor, 'status_changed', 'status', OLD.status::text, NEW.status::text);
      IF NEW.status = 'concluido' AND OLD.status <> 'concluido' THEN
        NEW.completed_at := now();
        IF NEW.created_by IS NOT NULL AND NEW.created_by <> v_actor THEN
          INSERT INTO public.notifications(user_id, title, body, link)
          VALUES (NEW.created_by, 'Tarefa concluída', 'A tarefa "' || NEW.title || '" foi concluída.', '/tarefas?task=' || NEW.id::text);
        END IF;
      END IF;
    END IF;
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      VALUES (NEW.id, NEW.owner_id, v_actor, 'priority_changed', 'priority', OLD.priority::text, NEW.priority::text);
    END IF;
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      VALUES (NEW.id, NEW.owner_id, v_actor, 'assignee_changed', 'assignee_id', OLD.assignee_id::text, NEW.assignee_id::text);
      IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        INSERT INTO public.notifications(user_id, title, body, link)
        VALUES (NEW.assignee_id, 'Você foi atribuído a uma tarefa', NEW.title, '/tarefas?task=' || NEW.id::text);
      END IF;
    END IF;
    IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      VALUES (NEW.id, NEW.owner_id, v_actor, 'project_changed', 'project_id', OLD.project_id::text, NEW.project_id::text);
    END IF;
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      VALUES (NEW.id, NEW.owner_id, v_actor, 'client_changed', 'client_id', OLD.client_id::text, NEW.client_id::text);
    END IF;
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      VALUES (NEW.id, NEW.owner_id, v_actor, 'due_date_changed', 'due_date', OLD.due_date::text, NEW.due_date::text);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_tasks_history ON public.tasks;
CREATE TRIGGER tg_tasks_history
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_history();

-- ============================================================
-- 13. History trigger on task_checklists
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_task_checklist_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, new_value)
    VALUES (NEW.task_id, NEW.owner_id, v_actor, 'checklist_added', 'checklist', NEW.label);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.done IS DISTINCT FROM OLD.done THEN
    INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, new_value)
    VALUES (NEW.task_id, NEW.owner_id, v_actor,
            CASE WHEN NEW.done THEN 'checklist_done' ELSE 'checklist_undone' END,
            'checklist', NEW.label);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, old_value)
    VALUES (OLD.task_id, OLD.owner_id, v_actor, 'checklist_deleted', 'checklist', OLD.label);
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_task_checklist_history ON public.task_checklists;
CREATE TRIGGER tg_task_checklist_history
AFTER INSERT OR UPDATE OR DELETE ON public.task_checklists
FOR EACH ROW EXECUTE FUNCTION public.tg_task_checklist_history();

-- ============================================================
-- 14. History trigger on task_attachments
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_task_attachment_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, new_value)
    VALUES (NEW.task_id, NEW.owner_id, v_actor, 'file_uploaded', 'attachment', NEW.name);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.task_history(task_id, owner_id, actor_id, action, field, old_value)
    VALUES (OLD.task_id, OLD.owner_id, v_actor, 'file_deleted', 'attachment', OLD.name);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_task_attachment_history ON public.task_attachments;
CREATE TRIGGER tg_task_attachment_history
AFTER INSERT OR DELETE ON public.task_attachments
FOR EACH ROW EXECUTE FUNCTION public.tg_task_attachment_history();

-- ============================================================
-- 15. Comment trigger: history + mention notifications
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_task_comment_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_task RECORD;
  v_uid uuid;
BEGIN
  SELECT title, owner_id INTO v_task FROM public.tasks WHERE id = NEW.task_id;

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
END;
$$;

DROP TRIGGER IF EXISTS tg_task_comment_event ON public.task_comments;
CREATE TRIGGER tg_task_comment_event
AFTER INSERT ON public.task_comments
FOR EACH ROW EXECUTE FUNCTION public.tg_task_comment_event();

-- ============================================================
-- 16. Auto-set created_by + updated_at on tasks
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_tasks_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_tasks_set_created_by ON public.tasks;
CREATE TRIGGER tg_tasks_set_created_by
BEFORE INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_set_created_by();

DROP TRIGGER IF EXISTS tg_tasks_updated_at ON public.tasks;
CREATE TRIGGER tg_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();