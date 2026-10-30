-- 31 — Fundo do tema escuro por empresa (30/10/2026)
-- Configurações › Aparência: "Tom da marca" (padrão) ou "Preto". Pode rodar mais de uma vez.
alter table public.organizations
  add column if not exists dark_style text not null default 'marca';
do $$ begin
  alter table public.organizations add constraint organizations_dark_style_chk check (dark_style in ('marca', 'preto'));
exception when duplicate_object then null; end $$;
