
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS commercial_model text NOT NULL DEFAULT 'projeto_fechado',
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS contracted_hours numeric(10,2),
  ADD COLUMN IF NOT EXISTS monthly_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS billing_day smallint,
  ADD COLUMN IF NOT EXISTS next_billing_date date;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_commercial_model_check
  CHECK (commercial_model IN ('projeto_fechado','mensal_recorrente','banco_horas','por_hora','suporte_continuo'));

ALTER TABLE public.projects
  ADD CONSTRAINT projects_service_type_check
  CHECK (service_type IS NULL OR service_type IN ('desenvolvimento','trafego_pago','gestao_conteudo','consultoria','design','suporte','outros'));

ALTER TABLE public.projects
  ADD CONSTRAINT projects_billing_day_check
  CHECK (billing_day IS NULL OR (billing_day BETWEEN 1 AND 28));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS time_spent_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS internal_cost numeric(12,2),
  ADD COLUMN IF NOT EXISTS generated_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true;
