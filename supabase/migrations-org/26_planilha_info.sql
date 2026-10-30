-- 26 — Dados da planilha fora da tabela (30/10/2026)
-- Guarda, em cada planilha de custo do projeto, o cabeçalho do formulário
-- (ex.: Nº S.C, data, contato), os valores somados ao total (substituição
-- tributária, frete) e as observações (condições de pagamento).
-- As regras de acesso de cost_sheets continuam valendo. Pode rodar mais de uma vez.

alter table public.cost_sheets
  add column if not exists info jsonb not null default '{}'::jsonb;
