
CREATE TABLE public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid not null,
  title text not null,
  kind text not null default 'tarefa',
  notes text,
  due_at timestamptz,
  done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tasks TO authenticated;
GRANT ALL ON public.lead_tasks TO service_role;
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead tasks" ON public.lead_tasks FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER lead_tasks_updated_at BEFORE UPDATE ON public.lead_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.lead_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid not null,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_files TO authenticated;
GRANT ALL ON public.lead_files TO service_role;
ALTER TABLE public.lead_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead files" ON public.lead_files FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_lead_task_journey()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_events (lead_id, owner_id, actor_id, kind, title, description)
    VALUES (NEW.lead_id, NEW.owner_id, auth.uid(), 'task_created', 'Agendamento criado', NEW.title);
  ELSIF TG_OP = 'UPDATE' AND NEW.done IS DISTINCT FROM OLD.done AND NEW.done THEN
    INSERT INTO public.lead_events (lead_id, owner_id, actor_id, kind, title, description)
    VALUES (NEW.lead_id, NEW.owner_id, auth.uid(), 'task_done', 'Agendamento concluído', NEW.title);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lead_tasks_journey AFTER INSERT OR UPDATE ON public.lead_tasks FOR EACH ROW EXECUTE FUNCTION public.tg_lead_task_journey();

CREATE OR REPLACE FUNCTION public.tg_lead_file_journey()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.lead_events (lead_id, owner_id, actor_id, kind, title, description)
  VALUES (NEW.lead_id, NEW.owner_id, auth.uid(), 'file_added', 'Arquivo anexado', NEW.name);
  RETURN NEW;
END $$;
CREATE TRIGGER lead_files_journey AFTER INSERT ON public.lead_files FOR EACH ROW EXECUTE FUNCTION public.tg_lead_file_journey();

CREATE POLICY "lead files read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'lead-files' AND owner = auth.uid());
CREATE POLICY "lead files insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'lead-files' AND owner = auth.uid());
CREATE POLICY "lead files delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'lead-files' AND owner = auth.uid());
