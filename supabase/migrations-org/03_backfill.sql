-- ETAPA 1.3 — preenche organization_id. Apenas UPDATE de linhas com valor nulo.
-- Nenhum dado é apagado ou sobrescrito. Seguro para reexecutar.

-- 3.1 leads: usa o workspace_id já preenchido
update public.leads l set organization_id = l.workspace_id
where l.organization_id is null and l.workspace_id is not null;

-- 3.2 tabelas com owner_id → organização pelo legacy_owner_id
do $$
declare t text;
  tables text[] := array[
    'leads','clients','projects','finances','finance_categories','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','google_sheets_sync','forms','files'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='owner_id') then continue; end if;
    execute format($f$
      update public.%I x set organization_id = o.id
      from public.organizations o
      where x.organization_id is null and o.legacy_owner_id = x.owner_id
    $f$, t);
  end loop;
end $$;

-- 3.3 tabelas com user_id
do $$
declare t text;
  tables text[] := array['subscriptions','user_modules','google_connections','files','lead_files','tasks'];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='user_id') then continue; end if;
    execute format($f$
      update public.%I x set organization_id = o.id
      from public.organizations o
      where x.organization_id is null and o.legacy_owner_id = x.user_id
    $f$, t);
  end loop;
end $$;

-- 3.4 financeiro com empresa_id
update public.servicos s set organization_id = o.id from public.organizations o
 where s.organization_id is null and o.id = s.empresa_id;
update public.contas c set organization_id = o.id from public.organizations o
 where c.organization_id is null and o.id = c.empresa_id;
update public.baixas b set organization_id = o.id from public.organizations o
 where b.organization_id is null and o.id = b.empresa_id;
-- empresa_id que na verdade é o user_id do dono
update public.servicos s set organization_id = o.id from public.organizations o
 where s.organization_id is null and o.legacy_owner_id = s.empresa_id;
update public.contas c set organization_id = o.id from public.organizations o
 where c.organization_id is null and o.legacy_owner_id = c.empresa_id;
update public.baixas b set organization_id = o.id from public.organizations o
 where b.organization_id is null and o.legacy_owner_id = b.empresa_id;
update public.baixas b set organization_id = f.organization_id from public.finances f
 where b.organization_id is null and f.id = coalesce(b.receita_id, b.despesa_id) and f.organization_id is not null;

-- 3.5 filhos de lead herdam do lead
do $$
declare t text; tables text[] := array['lead_notes','lead_events','lead_tasks','lead_files'];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format($f$
      update public.%I x set organization_id = l.organization_id
      from public.leads l
      where x.organization_id is null and l.id = x.lead_id and l.organization_id is not null
    $f$, t);
  end loop;
end $$;

-- 3.6 etapas herdam do pipeline; tarefas herdam do projeto
update public.pipeline_stages s set organization_id = p.organization_id from public.pipelines p
 where s.organization_id is null and p.id = s.pipeline_id and p.organization_id is not null;
update public.tasks t set organization_id = p.organization_id from public.projects p
 where t.organization_id is null and p.id = t.project_id and p.organization_id is not null;

-- 3.7 subscriptions: valores de contrato iniciais (preço congelado calculado na etapa 4)
update public.subscriptions set total_users = coalesce(total_users, 3) where total_users is null;

-- VERIFICAÇÃO: todos os pendentes devem ser 0 antes do arquivo 04.
do $$
declare t text; n bigint;
  tables text[] := array[
    'leads','clients','projects','finances','finance_categories','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','google_sheets_sync','forms','files',
    'servicos','contas','baixas','subscriptions','user_modules','google_connections'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*) from public.%I where organization_id is null', t) into n;
    raise notice 'pendentes % : %', t, n;
  end loop;
end $$;
