ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS temperature text DEFAULT 'morno';

COMMENT ON COLUMN public.leads.temperature IS 'Temperatura do lead: quente, morno ou frio';