ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'ativo';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'aguardando_cliente';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'em_pausa';