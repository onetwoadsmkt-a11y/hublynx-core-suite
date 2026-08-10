CREATE OR REPLACE FUNCTION public.tg_lead_note_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lead_events (lead_id, owner_id, actor_id, kind, title, description, meta)
  VALUES (NEW.lead_id, NEW.owner_id, NEW.author_id, 'note', 'Nota adicionada', left(NEW.body, 280), jsonb_build_object('note_id', NEW.id));
  UPDATE public.leads SET last_contact_at = now() WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;
