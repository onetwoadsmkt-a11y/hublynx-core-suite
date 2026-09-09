-- Fase 2 — adiciona organization_id (nullable) + FK + índice nas tabelas de negócio.
-- Nenhuma coluna existente é alterada. Seguro para reexecutar.

do $$
declare
  t text;
  tables text[] := array[
    'leads','clients','projects','finances','finance_categories','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks',
    'lead_webhooks','kanban_columns','task_labels','google_sheets_sync','forms',
    'servicos','contas','baixas','subscriptions','user_modules'
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
      where conname = format('%s_organization_id_fkey', t)
        and conrelid = format('public.%I', t)::regclass
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

-- Verificação: colunas criadas
select table_name from information_schema.columns
where table_schema = 'public' and column_name = 'organization_id'
order by table_name;
