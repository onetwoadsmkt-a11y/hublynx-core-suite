REVOKE ALL ON FUNCTION public.recalc_finance_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_baixas_recalc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_finances_competencia() FROM PUBLIC, anon, authenticated;