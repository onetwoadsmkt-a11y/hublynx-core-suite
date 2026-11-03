-- 32 — Tema escuro "Preto com cards brancos", texto sobre o preto e logo do escuro (03/11/2026)
-- Configurações › Aparência. Pode rodar mais de uma vez.
alter table public.organizations
  add column if not exists dark_text text not null default 'branco',
  add column if not exists logo_dark_url text;

alter table public.organizations drop constraint if exists organizations_dark_style_chk;
alter table public.organizations
  add constraint organizations_dark_style_chk check (dark_style in ('marca', 'preto', 'cards'));

do $$ begin
  alter table public.organizations add constraint organizations_dark_text_chk check (dark_text in ('branco', 'marca'));
exception when duplicate_object then null; end $$;

-- Valesafe Expansão: preto com cards brancos, texto branco (cor da marca amarela já cadastrada)
update public.organizations
   set dark_style = 'cards', dark_text = 'branco'
 where name ilike '%valesafe%expans%';

select id, name, brand_color, dark_style, dark_text, logo_dark_url
  from public.organizations
 where name ilike '%valesafe%expans%';
