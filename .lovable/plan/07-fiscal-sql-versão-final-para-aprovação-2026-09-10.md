# 07_fiscal.sql — versão final para aprovação

Duas validações pedidas:

1. `created_by` não pode ser definido manualmente: um gatilho força `created_by = auth.uid()`
   em todo INSERT feito por usuário autenticado e impede alteração no UPDATE. Service role
   (sem `auth.uid()`) mantém o valor enviado, para rotinas de servidor.
2. Super admin: `public.is_org_member()` e `public.is_org_admin()` já retornam verdadeiro para
   quem está em `platform_admins` (definido em `01_foundation.sql`). Portanto o super admin
   tem o mesmo acesso das demais tabelas **sem nenhuma policy nova fora do padrão**.

Ao aprovar, este conteúdo vira `supabase/migrations-org/07_fiscal.sql`. A execução continua manual.

```sql
-- ETAPA 7 — Estrutura fiscal (NFS-e padrão nacional / SEFIN DPS).
-- Somente cria. Não altera, não renomeia e não apaga nada existente. Reexecutável.
-- Super admin é coberto pelas funções is_org_member/is_org_admin (01_foundation.sql).

-- ============================================================
-- 1) ENUMS
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'fiscal_environment') then
    create type public.fiscal_environment as enum ('homologacao','producao');
  end if;
  if not exists (select 1 from pg_type where typname = 'fiscal_document_status') then
    create type public.fiscal_document_status as enum
      ('rascunho','pendente','processando','autorizada','rejeitada','cancelada','erro');
  end if;
end $$;

-- ============================================================
-- 2) ÍNDICES ÚNICOS (id, organization_id) — pré-requisito das FKs compostas
-- ============================================================
create unique index if not exists clients_id_org_key  on public.clients  (id, organization_id);
create unique index if not exists projects_id_org_key on public.projects (id, organization_id);
create unique index if not exists finances_id_org_key on public.finances (id, organization_id);
create unique index if not exists servicos_id_org_key on public.servicos (id, organization_id);

-- ============================================================
-- 3) fiscal_settings
-- ============================================================
create table if not exists public.fiscal_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ambiente public.fiscal_environment not null default 'homologacao',
  inscricao_municipal text,
  codigo_municipio text,
  regime_tributario text,
  optante_simples boolean not null default false,
  incentivo_fiscal boolean not null default false,
  serie_dps text,
  proximo_numero_dps bigint not null default 1,
  certificado_ref text,
  certificado_validade date,
  email_envio text,
  observacoes_padrao text,
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists fiscal_settings_org_key on public.fiscal_settings (organization_id);

-- ============================================================
-- 4) fiscal_service_codes
-- ============================================================
create table if not exists public.fiscal_service_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  servico_id uuid,
  descricao text not null,
  codigo_tributacao_nacional text,
  codigo_tributacao_municipal text,
  cnae text,
  aliquota_iss numeric(7,4),
  iss_retido boolean not null default false,
  retencao_ir numeric(7,4),
  retencao_pis numeric(7,4),
  retencao_cofins numeric(7,4),
  retencao_csll numeric(7,4),
  retencao_inss numeric(7,4),
  tributacao_municipio text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fiscal_service_codes_org_idx on public.fiscal_service_codes (organization_id, ativo);
create index if not exists fiscal_service_codes_servico_idx on public.fiscal_service_codes (servico_id);
create unique index if not exists fiscal_service_codes_id_org_key
  on public.fiscal_service_codes (id, organization_id);

-- ============================================================
-- 5) fiscal_documents (DPS -> NFS-e)
-- ============================================================
create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid,
  project_id uuid,
  status public.fiscal_document_status not null default 'rascunho',
  ambiente public.fiscal_environment not null default 'homologacao',

  dps_id text,
  dps_serie text,
  dps_numero text,
  competencia text,
  data_emissao timestamptz,

  valor_servicos numeric(14,2) not null default 0,
  valor_deducoes numeric(14,2) not null default 0,
  base_calculo numeric(14,2) not null default 0,
  aliquota_iss numeric(7,4),
  valor_iss numeric(14,2) not null default 0,
  iss_retido boolean not null default false,
  valor_retencoes numeric(14,2) not null default 0,
  valor_liquido numeric(14,2) not null default 0,

  nfse_numero text,
  nfse_chave_acesso text,
  nfse_codigo_verificacao text,
  protocolo text,
  data_autorizacao timestamptz,
  motivo_rejeicao text,
  cancelado_em timestamptz,
  motivo_cancelamento text,

  pdf_bucket text,
  pdf_path text,
  xml_bucket text,
  xml_path text,

  descricao_servico text,
  observacoes text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fiscal_documents_org_status_idx
  on public.fiscal_documents (organization_id, status, created_at desc);
create index if not exists fiscal_documents_client_idx  on public.fiscal_documents (client_id);
create index if not exists fiscal_documents_project_idx on public.fiscal_documents (project_id);
create unique index if not exists fiscal_documents_id_org_key
  on public.fiscal_documents (id, organization_id);
create unique index if not exists fiscal_documents_dps_key
  on public.fiscal_documents (organization_id, dps_id) where dps_id is not null;
create unique index if not exists fiscal_documents_serie_numero_key
  on public.fiscal_documents (organization_id, dps_serie, dps_numero)
  where dps_serie is not null and dps_numero is not null;

-- ============================================================
-- 6) fiscal_document_finances (N:N com títulos existentes)
-- ============================================================
create table if not exists public.fiscal_document_finances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fiscal_document_id uuid not null,
  finance_id uuid not null,
  valor_alocado numeric(14,2),
  created_at timestamptz not null default now(),
  unique (fiscal_document_id, finance_id)
);
create index if not exists fdf_finance_idx on public.fiscal_document_finances (finance_id);
create index if not exists fdf_org_idx     on public.fiscal_document_finances (organization_id);

-- ============================================================
-- 7) fiscal_document_items
-- ============================================================
create table if not exists public.fiscal_document_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fiscal_document_id uuid not null,
  fiscal_service_code_id uuid,
  descricao text not null,
  quantidade numeric(14,4) not null default 1,
  valor_unitario numeric(14,2) not null default 0,
  valor_total numeric(14,2) not null default 0,
  aliquota_iss numeric(7,4),
  valor_iss numeric(14,2) not null default 0,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists fdi_doc_idx on public.fiscal_document_items (fiscal_document_id, ordem);

-- ============================================================
-- 8) fiscal_events (auditoria)
-- ============================================================
create table if not exists public.fiscal_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fiscal_document_id uuid not null,
  tipo text not null,
  status public.fiscal_document_status,
  mensagem text,
  request_payload jsonb,
  response_payload jsonb,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists fiscal_events_doc_idx on public.fiscal_events (fiscal_document_id, created_at desc);

-- ============================================================
-- 9) FKs COMPOSTAS — nunca ligam registros de organizações diferentes.
--    "set null (coluna)" (PG 15+) anula só o vínculo opcional, nunca organization_id.
-- ============================================================
do $$
declare
  pg15 boolean := current_setting('server_version_num')::int >= 150000;
  optional_null text := case when current_setting('server_version_num')::int >= 150000
                             then 'set null (%s)' else 'no action' end;
  procedure_note text;
begin
  if not pg15 then
    raise notice 'PostgreSQL < 15: FKs opcionais usarão ON DELETE NO ACTION.';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fiscal_documents_client_org_fk') then
    execute format('alter table public.fiscal_documents add constraint fiscal_documents_client_org_fk
      foreign key (client_id, organization_id) references public.clients (id, organization_id)
      on delete ' || format(optional_null, 'client_id'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fiscal_documents_project_org_fk') then
    execute format('alter table public.fiscal_documents add constraint fiscal_documents_project_org_fk
      foreign key (project_id, organization_id) references public.projects (id, organization_id)
      on delete ' || format(optional_null, 'project_id'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fiscal_service_codes_servico_org_fk') then
    execute format('alter table public.fiscal_service_codes add constraint fiscal_service_codes_servico_org_fk
      foreign key (servico_id, organization_id) references public.servicos (id, organization_id)
      on delete ' || format(optional_null, 'servico_id'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fdi_service_code_org_fk') then
    execute format('alter table public.fiscal_document_items add constraint fdi_service_code_org_fk
      foreign key (fiscal_service_code_id, organization_id)
      references public.fiscal_service_codes (id, organization_id)
      on delete ' || format(optional_null, 'fiscal_service_code_id'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fdf_document_org_fk') then
    alter table public.fiscal_document_finances add constraint fdf_document_org_fk
      foreign key (fiscal_document_id, organization_id)
      references public.fiscal_documents (id, organization_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fdf_finance_org_fk') then
    alter table public.fiscal_document_finances add constraint fdf_finance_org_fk
      foreign key (finance_id, organization_id)
      references public.finances (id, organization_id) on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fdi_document_org_fk') then
    alter table public.fiscal_document_items add constraint fdi_document_org_fk
      foreign key (fiscal_document_id, organization_id)
      references public.fiscal_documents (id, organization_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fiscal_events_document_org_fk') then
    alter table public.fiscal_events add constraint fiscal_events_document_org_fk
      foreign key (fiscal_document_id, organization_id)
      references public.fiscal_documents (id, organization_id) on delete cascade;
  end if;
end $$;

-- ============================================================
-- 10) GATILHOS: organização automática + autor imutável
-- ============================================================
do $$
declare t text;
  tables text[] := array['fiscal_settings','fiscal_service_codes','fiscal_documents',
                         'fiscal_document_finances','fiscal_document_items','fiscal_events'];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_fill_org on public.%I', t);
    execute format('create trigger trg_fill_org before insert on public.%I
      for each row execute function public.fill_organization_id()', t);
  end loop;
end $$;

-- created_by nunca é definido manualmente por usuário autenticado.
create or replace function public.force_created_by()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    return new;
  end if;
  new.created_by := old.created_by;   -- imutável no update
  return new;
end $fn$;

do $$
declare t text;
  tables text[] := array['fiscal_documents','fiscal_events'];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_force_created_by on public.%I', t);
    execute format('create trigger trg_force_created_by before insert or update on public.%I
      for each row execute function public.force_created_by()', t);
  end loop;
end $$;

-- ============================================================
-- 11) GRANTS + RLS no padrão "org ..." (super admin coberto pelas funções)
-- ============================================================
do $$
declare t text;
  tables text[] := array['fiscal_settings','fiscal_service_codes','fiscal_documents',
                         'fiscal_document_finances','fiscal_document_items'];
begin
  foreach t in array tables loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "org select %s" on public.%I', t, t);
    execute format($p$create policy "org select %s" on public.%I for select to authenticated
      using (organization_id is not null and public.is_org_member(organization_id))$p$, t, t);
    execute format('drop policy if exists "org insert %s" on public.%I', t, t);
    execute format($p$create policy "org insert %s" on public.%I for insert to authenticated
      with check (organization_id is not null and public.is_org_member(organization_id))$p$, t, t);
    execute format('drop policy if exists "org update %s" on public.%I', t, t);
    execute format($p$create policy "org update %s" on public.%I for update to authenticated
      using (organization_id is not null and public.is_org_member(organization_id))
      with check (organization_id is not null and public.is_org_member(organization_id))$p$, t, t);
    execute format('drop policy if exists "org delete %s" on public.%I', t, t);
    execute format($p$create policy "org delete %s" on public.%I for delete to authenticated
      using (organization_id is not null and public.is_org_member(organization_id))$p$, t, t);
  end loop;
end $$;

-- Configuração fiscal e cadastro fiscal de serviços: escrita só para admin da empresa.
do $$
declare t text;
  tables text[] := array['fiscal_settings','fiscal_service_codes'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "org insert %s" on public.%I', t, t);
    execute format($p$create policy "org insert %s" on public.%I for insert to authenticated
      with check (organization_id is not null and public.is_org_admin(organization_id))$p$, t, t);
    execute format('drop policy if exists "org update %s" on public.%I', t, t);
    execute format($p$create policy "org update %s" on public.%I for update to authenticated
      using (organization_id is not null and public.is_org_admin(organization_id))
      with check (organization_id is not null and public.is_org_admin(organization_id))$p$, t, t);
    execute format('drop policy if exists "org delete %s" on public.%I', t, t);
    execute format($p$create policy "org delete %s" on public.%I for delete to authenticated
      using (organization_id is not null and public.is_org_admin(organization_id))$p$, t, t);
  end loop;
end $$;

-- fiscal_events: auditoria imutável (sem update/delete).
grant select, insert on public.fiscal_events to authenticated;
grant all on public.fiscal_events to service_role;
alter table public.fiscal_events enable row level security;
drop policy if exists "org select fiscal_events" on public.fiscal_events;
create policy "org select fiscal_events" on public.fiscal_events for select to authenticated
  using (organization_id is not null and public.is_org_member(organization_id));
drop policy if exists "org insert fiscal_events" on public.fiscal_events;
create policy "org insert fiscal_events" on public.fiscal_events for insert to authenticated
  with check (organization_id is not null and public.is_org_member(organization_id));

-- ============================================================
-- 12) STORAGE PRIVADO — apenas PDF/XML, caminho validado
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fiscal-files', 'fiscal-files', false, 26214400,
        array['application/pdf','application/xml','text/xml'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.fiscal_storage_allowed(_name text)
returns boolean language plpgsql stable security definer
set search_path = public, storage as $fn$
declare parts text[]; org uuid; doc uuid;
begin
  if _name is null or position('..' in _name) > 0 then return false; end if;
  if _name !~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(pdf|xml)$' then return false; end if;

  parts := string_to_array(_name, '/');
  begin
    org := parts[1]::uuid;
    doc := parts[2]::uuid;
  exception when others then return false;
  end;

  if not public.is_org_member(org) then return false; end if;

  return exists (
    select 1 from public.fiscal_documents d
    where d.id = doc and d.organization_id = org
  );
end $fn$;

revoke all on function public.fiscal_storage_allowed(text) from public, anon;
grant execute on function public.fiscal_storage_allowed(text) to authenticated, service_role;

do $$
declare a text;
begin
  foreach a in array array['read','write','update','delete'] loop
    execute format('drop policy if exists "fiscal files %s" on storage.objects', a);
  end loop;
end $$;

create policy "fiscal files read" on storage.objects for select to authenticated
  using (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name));
create policy "fiscal files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name));
create policy "fiscal files update" on storage.objects for update to authenticated
  using (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name))
  with check (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name));
create policy "fiscal files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name));

-- ============================================================
-- 13) VERIFICAÇÃO
-- ============================================================
select tablename, count(*) filter (where policyname like 'org %') as policies_org, count(*) as total
from pg_policies where schemaname = 'public' and tablename like 'fiscal%'
group by tablename order by tablename;

select conname, conrelid::regclass as tabela
from pg_constraint
where conname in ('fiscal_documents_client_org_fk','fiscal_documents_project_org_fk',
                  'fiscal_service_codes_servico_org_fk','fdf_document_org_fk','fdf_finance_org_fk',
                  'fdi_document_org_fk','fdi_service_code_org_fk','fiscal_events_document_org_fk')
order by conrelid::regclass::text, conname;
```
