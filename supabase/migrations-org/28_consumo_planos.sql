-- 28 — Consumo de banco e arquivos por empresa, plano base e pacotes extras (30/10/2026)
-- * storage_packages: Plano Core (incluído) e a escala Extra 1/2/3 (valores guardados;
--   a tela mantém os valores ocultos por enquanto).
-- * organizations.storage_package: pacote extra contratado pela empresa (vazio = só o plano).
-- * org_usage_bytes(org): mede o banco (tamanho real das linhas da empresa + índices,
--   estimado) e os arquivos (anexos das tarefas, arquivos, arquivos de leads e anexos das planilhas).
-- Pode rodar mais de uma vez.

begin;

create table if not exists public.storage_packages (
  code text primary key,
  name text not null,
  database_mb integer not null,
  storage_mb integer not null,
  monthly_price numeric(10,2),
  is_base boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.storage_packages (code, name, database_mb, storage_mb, monthly_price, is_base, sort_order)
values
  ('core',   'Plano Core', 500,   5120,   169.90, true,  0),
  ('extra1', 'Extra 1',    1024,  10240,  29.90,  false, 1),
  ('extra2', 'Extra 2',    3072,  30720,  69.90,  false, 2),
  ('extra3', 'Extra 3',    10240, 102400, 179.90, false, 3)
on conflict (code) do nothing;

alter table public.storage_packages enable row level security;
drop policy if exists "storage packages read" on public.storage_packages;
create policy "storage packages read" on public.storage_packages for select to authenticated using (true);
drop policy if exists "storage packages admin" on public.storage_packages;
create policy "storage packages admin" on public.storage_packages for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
grant select on public.storage_packages to authenticated;
grant all on public.storage_packages to service_role;

alter table public.organizations
  add column if not exists storage_package text references public.storage_packages(code) on delete set null;

-- Medição por empresa (super admin, membros da empresa ou o servidor)
create or replace function public.org_usage_bytes(_org uuid)
returns table (database_bytes bigint, files_bytes bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  t text;
  part bigint;
  db_total numeric := 0;
  files_total numeric := 0;
begin
  if auth.uid() is not null and not (public.is_super_admin() or public.is_org_member(_org)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- tabelas com organization_id: tamanho real das linhas
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'organization_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('select coalesce(sum(pg_column_size(x.*)), 0) from public.%I x where x.organization_id = $1', t)
      into part using _org;
    db_total := db_total + part;
  end loop;
  -- histórico e mensagens das tarefas (ligados pela tarefa)
  if to_regclass('public.task_history') is not null then
    select db_total + coalesce(sum(pg_column_size(h.*)), 0) into db_total
    from public.task_history h join public.tasks k on k.id = h.task_id where k.organization_id = _org;
  end if;
  if to_regclass('public.task_comments') is not null then
    select db_total + coalesce(sum(pg_column_size(c.*)), 0) into db_total
    from public.task_comments c join public.tasks k on k.id = c.task_id where k.organization_id = _org;
  end if;
  -- índices e estrutura: +50% sobre os dados
  db_total := db_total * 1.5;

  -- arquivos
  if to_regclass('public.task_attachments') is not null then
    select files_total + coalesce(sum(a.size), 0) into files_total
    from public.task_attachments a where a.organization_id = _org;
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public'
      and table_name = 'files' and column_name in ('organization_id', 'size_bytes')) = 2 then
    execute 'select coalesce(sum(size_bytes), 0) from public.files where organization_id = $1' into part using _org;
    files_total := files_total + part;
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public'
      and table_name = 'lead_files' and column_name in ('organization_id', 'size_bytes')) = 2 then
    execute 'select coalesce(sum(size_bytes), 0) from public.lead_files where organization_id = $1' into part using _org;
    files_total := files_total + part;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'cost_sheets' and column_name = 'info') then
    execute $q$
      select coalesce(sum((a->>'size')::numeric), 0)
      from public.cost_sheets s, jsonb_array_elements(coalesce(s.info->'attachments', '[]'::jsonb)) a
      where s.organization_id = $1 $q$ into part using _org;
    files_total := files_total + part;
  end if;

  return query select db_total::bigint, files_total::bigint;
end $$;
revoke all on function public.org_usage_bytes(uuid) from public, anon;
grant execute on function public.org_usage_bytes(uuid) to authenticated, service_role;

commit;
