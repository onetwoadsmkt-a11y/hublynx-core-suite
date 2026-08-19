-- 1) CONTAS
CREATE TABLE public.contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  saldo_inicial numeric NOT NULL DEFAULT 0,
  data_saldo_inicial date NOT NULL DEFAULT CURRENT_DATE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas TO authenticated;
GRANT ALL ON public.contas TO service_role;
ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contas_owner_all" ON public.contas FOR ALL TO authenticated
  USING (empresa_id = auth.uid()) WITH CHECK (empresa_id = auth.uid());
CREATE TRIGGER trg_contas_updated BEFORE UPDATE ON public.contas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_contas_empresa ON public.contas(empresa_id);

INSERT INTO public.contas (empresa_id, nome, saldo_inicial, data_saldo_inicial)
SELECT DISTINCT f.owner_id, 'Conta principal', 0, CURRENT_DATE FROM public.finances f;

-- 2) BAIXAS
CREATE TABLE public.baixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receita_id uuid REFERENCES public.finances(id) ON DELETE CASCADE,
  despesa_id uuid REFERENCES public.finances(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT CURRENT_DATE,
  valor numeric NOT NULL,
  forma_pagamento text,
  conta_id uuid REFERENCES public.contas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT baixas_one_target CHECK (num_nonnulls(receita_id, despesa_id) = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baixas TO authenticated;
GRANT ALL ON public.baixas TO service_role;
ALTER TABLE public.baixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "baixas_owner_all" ON public.baixas FOR ALL TO authenticated
  USING (empresa_id = auth.uid()) WITH CHECK (empresa_id = auth.uid());
CREATE TRIGGER trg_baixas_updated BEFORE UPDATE ON public.baixas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_baixas_receita ON public.baixas(receita_id);
CREATE INDEX idx_baixas_despesa ON public.baixas(despesa_id);
CREATE INDEX idx_baixas_data ON public.baixas(empresa_id, data);

-- 3) COMPETENCIA + NATUREZA
ALTER TABLE public.finances
  ADD COLUMN competencia char(7),
  ADD COLUMN natureza text NOT NULL DEFAULT 'fee';
ALTER TABLE public.finances
  ADD CONSTRAINT finances_natureza_chk CHECK (natureza IN ('fee','repasse','reembolso')),
  ADD CONSTRAINT finances_competencia_chk CHECK (competencia IS NULL OR competencia ~ '^\d{4}-\d{2}$');
UPDATE public.finances SET competencia = to_char(due_date, 'YYYY-MM') WHERE competencia IS NULL;
ALTER TABLE public.finances ALTER COLUMN competencia SET NOT NULL;

-- 4) MIGRAR PAGAMENTOS EXISTENTES PARA BAIXAS
INSERT INTO public.baixas (empresa_id, receita_id, despesa_id, data, valor, forma_pagamento, conta_id)
SELECT f.owner_id,
       CASE WHEN f.kind = 'receber' THEN f.id END,
       CASE WHEN f.kind = 'pagar' THEN f.id END,
       COALESCE(f.paid_at, f.due_date),
       f.amount,
       f.payment_method,
       (SELECT c.id FROM public.contas c WHERE c.empresa_id = f.owner_id ORDER BY c.created_at LIMIT 1)
FROM public.finances f
WHERE f.status = 'pago';

-- 5) NOVOS STATUS
ALTER TABLE public.finances ALTER COLUMN status DROP DEFAULT;
CREATE TYPE public.finance_status_new AS ENUM ('aberto','parcial','quitado','cancelado');
ALTER TABLE public.finances
  ALTER COLUMN status TYPE public.finance_status_new
  USING (CASE WHEN status::text = 'pago' THEN 'quitado' ELSE 'aberto' END)::public.finance_status_new;
DROP TYPE public.finance_status;
ALTER TYPE public.finance_status_new RENAME TO finance_status;
ALTER TABLE public.finances ALTER COLUMN status SET DEFAULT 'aberto'::public.finance_status;

-- 6) STATUS AUTOMATICO A PARTIR DAS BAIXAS
CREATE OR REPLACE FUNCTION public.recalc_finance_status(_finance_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total numeric; v_pago numeric; v_status text;
BEGIN
  SELECT amount, status::text INTO v_total, v_status FROM public.finances WHERE id = _finance_id;
  IF NOT FOUND OR v_status = 'cancelado' THEN RETURN; END IF;
  SELECT COALESCE(SUM(valor), 0) INTO v_pago FROM public.baixas
    WHERE receita_id = _finance_id OR despesa_id = _finance_id;
  UPDATE public.finances SET
    status = (CASE WHEN v_pago <= 0 THEN 'aberto' WHEN v_pago < v_total THEN 'parcial' ELSE 'quitado' END)::public.finance_status,
    paid_at = (SELECT MAX(data) FROM public.baixas WHERE receita_id = _finance_id OR despesa_id = _finance_id)
  WHERE id = _finance_id;
END $$;

CREATE OR REPLACE FUNCTION public.tg_baixas_recalc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.recalc_finance_status(COALESCE(OLD.receita_id, OLD.despesa_id));
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.recalc_finance_status(COALESCE(NEW.receita_id, NEW.despesa_id));
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_baixas_recalc AFTER INSERT OR UPDATE OR DELETE ON public.baixas
  FOR EACH ROW EXECUTE FUNCTION public.tg_baixas_recalc();

-- 7) CAMPOS DERIVADOS (nunca colunas)
CREATE VIEW public.finances_calc WITH (security_invoker = true) AS
SELECT f.*,
  COALESCE(b.valor_pago, 0) AS valor_pago,
  f.amount - COALESCE(b.valor_pago, 0) AS saldo,
  GREATEST(0, (CURRENT_DATE - f.due_date)) AS dias_atraso,
  (f.due_date < CURRENT_DATE AND f.status NOT IN ('quitado','cancelado')
    AND (f.amount - COALESCE(b.valor_pago, 0)) > 0) AS em_atraso
FROM public.finances f
LEFT JOIN LATERAL (
  SELECT SUM(valor) AS valor_pago FROM public.baixas bx
  WHERE bx.receita_id = f.id OR bx.despesa_id = f.id
) b ON true;
GRANT SELECT ON public.finances_calc TO authenticated;
GRANT ALL ON public.finances_calc TO service_role;