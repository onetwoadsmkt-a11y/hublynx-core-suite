ALTER TABLE public.lead_webhooks
  ADD COLUMN IF NOT EXISTS field_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_payload jsonb,
  ADD COLUMN IF NOT EXISTS last_payload_at timestamptz;