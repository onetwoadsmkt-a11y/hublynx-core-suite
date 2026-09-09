-- ETAPA 1.2 — adiciona organization_id (nullable) + FK + índices nas tabelas de negócio.
-- Nenhuma coluna existente é alterada. Seguro para reexecutar.

do $$
declare
  t text;
  tables text[] := array[
    'leads','clients','projects','finances','finance_categories','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','google_sheets_sync','forms','files',
    'servicos','contas','baixas','subscriptions','user_modules','google_connections'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'tabela ausente, ignorada: %', t;
      continue;
    end if;
    execute format('alter table public.%I add column if not exists organization_id uuid', t);
    if not exists (
      select 1 from pg_constraint
      where conname = t || '_organization_id_fkey' and conrelid = ('public.' || t)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (organization_id) references public.organizations(id) on delete restrict',
        t, t || '_organization_id_fkey');
    end if;
    execute format('create index if not exists %I on public.%I (organization_id)', t || '_organization_id_idx', t);
  end loop;
end $$;

create index if not exists leads_org_created_idx on public.leads (organization_id, created_at desc);
create index if not exists leads_org_stage_idx on public.leads (organization_id, stage_id);

-- clients: campos da entidade central de clientes (customers)
alter table public.clients add column if not exists company_name text;
alter table public.clients add column if not exists document text;
alter table public.clients add column if not exists lead_id uuid;

-- subscriptions: passa a ser por organização (colunas antigas preservadas)
alter table public.subscriptions add column if not exists total_users integer not null default 3;
alter table public.subscriptions add column if not exists monthly_price numeric(12,2);
alter table public.subscriptions add column if not exists renewal_date date;
create unique index if not exists subscriptions_org_key on public.subscriptions (organization_id) where organization_id is not null;

-- projects: vínculo com a oportunidade (lead) de origem
alter table public.projects add column if not exists lead_id uuid;
alter table public.projects add column if not exists template_id uuid;
alter table public.projects add column if not exists responsible_id uuid;
alter table public.projects add column if not exists priority text;
create index if not exists projects_lead_idx on public.projects (lead_id);

-- Verificação
select table_name from information_schema.columns
where table_schema = 'public' and column_name = 'organization_id'
order by table_name;
