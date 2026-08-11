ALTER TABLE public.lead_tasks
  ADD COLUMN IF NOT EXISTS gcal_event_id text,
  ADD COLUMN IF NOT EXISTS meet_link text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 30;