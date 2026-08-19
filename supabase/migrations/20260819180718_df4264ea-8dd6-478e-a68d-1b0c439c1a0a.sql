ALTER TABLE public.finances ALTER COLUMN competencia DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_finances_competencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.competencia IS NULL AND NEW.due_date IS NOT NULL THEN
    NEW.competencia := to_char(NEW.due_date, 'YYYY-MM');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tg_finances_competencia ON public.finances;
CREATE TRIGGER tg_finances_competencia
BEFORE INSERT OR UPDATE ON public.finances
FOR EACH ROW EXECUTE FUNCTION public.tg_finances_competencia();

UPDATE public.finances SET competencia = to_char(due_date, 'YYYY-MM') WHERE competencia IS NULL;