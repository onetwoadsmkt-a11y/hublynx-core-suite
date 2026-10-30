-- 26 — Dados da planilha fora da tabela (30/10/2026)
-- Guarda, em cada planilha de custo do projeto, o cabeçalho do formulário
-- (ex.: Nº S.C, data, contato), os valores somados ao total (substituição
-- tributária, frete) e as observações (condições de pagamento).
-- As regras de acesso de cost_sheets continuam valendo. Pode rodar mais de uma vez.

alter table public.cost_sheets
  add column if not exists info jsonb not null default '{}'::jsonb;

-- "Itens comprados" no modelo da Solicitação de Compras (projetos e modelos de projeto).
-- Mantém as mesmas chaves (os lançamentos continuam valendo), acrescenta Situação do C.A.
-- e ST, e o Valor total passa a ser Val. unit. × Quant. × (1 + IPI), como na planilha.
-- Só mexe nas abas ainda no formato antigo; colunas criadas pela empresa ficam no fim.
with alvo as (
  select s.id, s.columns, s.info
  from public.cost_sheets s
  where lower(trim(s.name)) = 'itens comprados'
    and not s.columns @> '[{"type":"validity"}]'::jsonb
    and (select count(*) from jsonb_array_elements(s.columns) c
         where c->>'key' in ('fornecedor', 'produto', 'certificado', 'validade', 'fatura_em', 'valor_unit', 'quantidade', 'icms', 'ipi', 'total')) = 10
)
update public.cost_sheets s
   set columns = '[{"key": "fornecedor", "label": "Fornecedor", "type": "text", "width": 160}, {"key": "produto", "label": "Descrição do produto", "type": "text", "width": 280}, {"key": "certificado", "label": "CA", "type": "text", "width": 100}, {"key": "validade", "label": "Valid CA", "type": "date", "alert": true}, {"key": "situacao_ca", "label": "Situação do C.A.", "type": "validity", "validity": {"ref": "validade"}}, {"key": "fatura_em", "label": "Fatura em", "type": "text", "width": 130}, {"key": "valor_unit", "label": "Val. unit.", "type": "currency"}, {"key": "quantidade", "label": "Quant.", "type": "number", "sum": true}, {"key": "st", "label": "ST", "type": "currency"}, {"key": "icms", "label": "ICMS", "type": "percent"}, {"key": "ipi", "label": "IPI", "type": "percent"}, {"key": "total", "label": "Valor total", "type": "calc", "sum": true, "calc": {"op": "mul", "a": "valor_unit", "b": "quantidade", "asCurrency": true, "expr": "{valor_unit}*{quantidade}*(1+({ipi}/100))"}}]'::jsonb
                 || coalesce((select jsonb_agg(c) from jsonb_array_elements(alvo.columns) c
                              where c->>'key' not in ('fornecedor', 'produto', 'certificado', 'validade', 'fatura_em', 'valor_unit', 'quantidade', 'icms', 'ipi', 'total')), '[]'::jsonb),
       info = case when alvo.info = '{}'::jsonb
                   then '{"title": "Solicitação de compras", "fields": [{"key": "n_s_c", "label": "Nº S.C", "value": ""}, {"key": "data", "label": "Data", "value": ""}, {"key": "franquia", "label": "Franquia", "value": ""}, {"key": "contato", "label": "Contato", "value": ""}, {"key": "e_mail", "label": "E-mail", "value": ""}, {"key": "telefone", "label": "Telefone", "value": ""}], "adjustments": [{"key": "substituicao_tributaria", "label": "Substituição tributária", "value": null}, {"key": "frete", "label": "Frete", "value": null, "note": "FOB"}], "notes": [{"label": "Condições de pagamento", "value": ""}, {"label": "Frete", "value": "FOB"}], "totalKey": "total"}'::jsonb
                   else alvo.info end
  from alvo
 where alvo.id = s.id;
