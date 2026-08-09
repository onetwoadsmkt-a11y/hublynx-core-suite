-- Stages
CREATE TABLE public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#00D084',
  position integer NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages TO authenticated;
GRANT ALL ON public.pipeline_stages TO service_role;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stages" ON public.pipeline_stages FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Leads
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  assignee_id uuid,
  name text NOT NULL,
  company text,
  email text,
  phone text,
  city text,
  state text,
  source text,
  value numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'aberto',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  gclid text,
  fbclid text,
  landing_url text,
  referrer text,
  tags text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0,
  last_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own leads" ON public.leads FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_leads_stage ON public.leads(stage_id);
CREATE INDEX idx_leads_owner ON public.leads(owner_id);

-- Notes
CREATE TABLE public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notes TO authenticated;
GRANT ALL ON public.lead_notes TO service_role;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead notes" ON public.lead_notes FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_lead_notes_lead ON public.lead_notes(lead_id);

-- Journey events
CREATE TABLE public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  actor_id uuid,
  kind text NOT NULL,
  title text NOT NULL,
  description text,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_events TO authenticated;
GRANT ALL ON public.lead_events TO service_role;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead events" ON public.lead_events FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_lead_events_lead ON public.lead_events(lead_id, created_at DESC);

-- Webhooks
CREATE TABLE public.lead_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  direction text NOT NULL DEFAULT 'inbound',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
  secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  target_url text,
  default_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  last_called_at timestamptz,
  call_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_webhooks TO authenticated;
GRANT ALL ON public.lead_webhooks TO service_role;
ALTER TABLE public.lead_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead webhooks" ON public.lead_webhooks FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- updated_at triggers
CREATE TRIGGER trg_pipeline_stages_updated BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_lead_webhooks_updated BEFORE UPDATE ON public.lead_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Journey logging
CREATE OR REPLACE FUNCTION public.tg_lead_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_stage text;
  new_stage text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_events (lead_id, owner_id, actor_id, kind, title, meta)
    VALUES (NEW.id, NEW.owner_id, auth.uid(), 'created', 'Lead criado',
            jsonb_build_object('source', NEW.source, 'utm_campaign', NEW.utm_campaign));
    RETURN NEW;
  END IF;

  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    SELECT name INTO old_stage FROM public.pipeline_stages WHERE id = OLD.stage_id;
    SELECT name INTO new_stage FROM public.pipeline_stages WHERE id = NEW.stage_id;
    INSERT INTO public.lead_events (lead_id, owner_id, actor_id, kind, title, description, meta)
    VALUES (NEW.id, NEW.owner_id, auth.uid(), 'stage_changed', 'Etapa alterada',
            coalesce(old_stage, '—') || ' → ' || coalesce(new_stage, '—'),
            jsonb_build_object('from', OLD.stage_id, 'to', NEW.stage_id));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.lead_events (lead_id, owner_id, actor_id, kind, title, description)
    VALUES (NEW.id, NEW.owner_id, auth.uid(), 'status_changed', 'Status alterado',
            OLD.status || ' → ' || NEW.status);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_journey
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_journey();

CREATE OR REPLACE FUNCTION public.tg_lead_note_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lead_events (lead_id, owner_id, actor_id, kind, title, description)
  VALUES (NEW.lead_id, NEW.owner_id, NEW.author_id, 'note', 'Nota adicionada', left(NEW.body, 280));
  UPDATE public.leads SET last_contact_at = now() WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lead_notes_journey
AFTER INSERT ON public.lead_notes
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_note_journey();