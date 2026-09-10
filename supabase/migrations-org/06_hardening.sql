-- ETAPA 6 — Endurecimento multi-tenant (executar em blocos, na ordem).
-- Nenhum bloco apaga dados. O bloco C só remove POLICIES antigas (por owner_id/user_id),
-- depois que as policies "org ..." já estiverem cobrindo todas as tabelas.

-- ============================================================
-- BLOCO A — CONFERÊNCIA (rodar sozinho primeiro)
-- Todos os resultados de "pendentes" precisam ser 0.
-- ============================================================
do $$
declare t text; n bigint;
  tables text[] := array[
    'leads','clients','projects','finances','finance_categories','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','google_sheets_sync','forms','files',
    'servicos','contas','baixas','subscriptions','user_modules'
  ];
begin
  create temp table if not exists _pendentes(tabela text, pendentes bigint) on commit drop;
  delete from _pendentes;
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*) from public.%I where organization_id is null', t) into n;
    insert into _pendentes values (t, n);
  end loop;
end $$;
select * from _pendentes where pendentes > 0 order by pendentes desc;

-- ============================================================
-- BLOCO B — organization_id NOT NULL
-- Rodar SOMENTE se o bloco A não retornou nenhuma linha.
-- finance_categories fica de fora (categorias globais podem ter organização nula).
-- ============================================================
do $$
declare t text;
  tables text[] := array[
    'leads','clients','projects','finances','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','files',
    'servicos','contas','baixas'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t
                 and column_name='organization_id' and is_nullable='YES') then
      execute format('alter table public.%I alter column organization_id set not null', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- BLOCO C — remover policies antigas por owner_id / user_id
-- C1: relatório do que será removido (rodar e conferir).
-- ============================================================
select tablename, policyname, cmd, coalesce(qual, with_check) as regra
from pg_policies
where schemaname = 'public'
  and tablename in (
    'leads','clients','projects','finances','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','files','servicos','contas','baixas'
  )
  and policyname not like 'org %'
  and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(owner_id|user_id|empresa_id)'
order by tablename, policyname;

-- C2: remoção efetiva (rodar depois de conferir o relatório de C1).
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in (
        'leads','clients','projects','finances','tasks',
        'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
        'lead_webhooks','kanban_columns','task_labels','files','servicos','contas','baixas'
      )
      and policyname not like 'org %'
      and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(owner_id|user_id|empresa_id)'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ============================================================
-- BLOCO D — verificação final: cada tabela precisa ter 4 policies "org ..."
-- ============================================================
select tablename, count(*) filter (where policyname like 'org %') as policies_org,
       count(*) as policies_total
from pg_policies
where schemaname='public'
  and tablename in (
    'leads','clients','projects','finances','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','files','servicos','contas','baixas'
  )
group by tablename order by tablename;
