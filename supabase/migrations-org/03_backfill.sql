-- Fase 3 — preenche organization_id. Apenas UPDATE de linhas com valor nulo.
-- Nenhum dado existente é apagado ou sobrescrito. Seguro para reexecutar.

-- 3.1 leads: usa o workspace_id já preenchido; senão cai no owner_id.
update public.leads l set organization_id = l.workspace_id
where l.organization_id is null and l.workspace_id is not null;

-- 3.2 tabelas com owner_id → organização pelo legacy_owner_id
do $$
declare
  t text;
  tables text[] := array[
    'leads','clients','projects','finances','finance_categories','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks',
    'lead_webhooks','kanban_columns','task_labels','google_sheets_sync','forms'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format($f$
      update public.%I x
      set organization_id = o.id
      from public.organizations o
      where x.organization_id is null and o.legacy_owner_id = x.owner_id
    $f$, t);
  end loop;
end $$;

-- 3.3 tabelas com user_id
update public.subscriptions s set organization_id = o.id
from public.organizations o
where s.organization_id is null and o.legacy_owner_id = s.user_id;

update public.user_modules u set organization_id = o.id
from public.organizations o
where u.organization_id is null and o.legacy_owner_id = u.user_id;

-- 3.4 financeiro com empresa_id (mapeia 1:1 quando o id coincide com a organização)
update public.servicos s set organization_id = o.id
from public.organizations o
where s.organization_id is null and o.id = s.empresa_id;

update public.contas c set organization_id = o.id
from public.organizations o
where c.organization_id is null and o.id = c.empresa_id;

update public.baixas b set organization_id = o.id
from public.organizations o
where b.organization_id is null and o.id = b.empresa_id;

-- 3.5 baixas sem correspondência: herda da receita/despesa vinculada
update public.baixas b set organization_id = f.organization_id
from public.finances f
where b.organization_id is null and f.id = coalesce(b.receita_id, b.despesa_id)
  and f.organization_id is not null;

-- 3.6 filhos de lead que ainda ficaram sem organização: herdam do lead
do $$
declare
  t text;
  tables text[] := array['lead_notes','lead_events','lead_tasks'];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format($f$
      update public.%I x
      set organization_id = l.organization_id
      from public.leads l
      where x.organization_id is null and l.id = x.lead_id and l.organization_id is not null
    $f$, t);
  end loop;
end $$;

-- VERIFICAÇÃO: todas as linhas devem retornar pendentes = 0 antes de seguir para a fase 4.
do $$
declare
  t text;
  n bigint;
  tables text[] := array[
    'leads','clients','projects','finances','finance_categories','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks',
    'lead_webhooks','kanban_columns','task_labels','google_sheets_sync','forms',
    'servicos','contas','baixas','subscriptions','user_modules'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*) from public.%I where organization_id is null', t) into n;
    raise notice 'pendentes % : %', t, n;
  end loop;
end $$;
