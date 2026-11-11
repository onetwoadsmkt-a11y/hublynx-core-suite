-- 39a — Valesafe Expansão como assinante: DIAGNÓSTICO (somente leitura, não altera nada)
-- Rodar no SQL Editor do Supabase (gyxzrnoxzaraossrqyuc) e mandar o resultado de cada bloco.
-- Empresas: Hublynx = 2d4ce02e-5e15-4b0d-8192-0ca9a63aff1f · Valesafe = bb176c8f-59db-4d67-89ba-9ef29767ae29

-- 1) As duas empresas
select id, name, slug, status, contracted_users, legacy_owner_id,
       (select email from auth.users u where u.id = o.legacy_owner_id) as dono_legado
from public.organizations o
where id in ('2d4ce02e-5e15-4b0d-8192-0ca9a63aff1f', 'bb176c8f-59db-4d67-89ba-9ef29767ae29')
   or slug in ('hublynx', 'valesafe');

-- 2) Quem é membro de cada empresa (e quem está nas duas)
select o.slug as empresa, u.email, m.role, m.status,
       (select count(*) from public.organization_members m2
         where m2.user_id = m.user_id and m2.status = 'active') as empresas_ativas
from public.organization_members m
join public.organizations o on o.id = m.organization_id
join auth.users u on u.id = m.user_id
where o.id in ('2d4ce02e-5e15-4b0d-8192-0ca9a63aff1f', 'bb176c8f-59db-4d67-89ba-9ef29767ae29')
order by u.email, o.slug;

-- 3) Por tabela: registros da Valesafe cujo dono é a conta hublynx.dev@gmail.com
--    (é isso que faz os dados aparecerem misturados para essa conta)
do $$
declare
  t text; v_hub uuid; n_val bigint; n_hub_val bigint; n_null bigint;
begin
  select id into v_hub from auth.users where lower(email) = 'hublynx.dev@gmail.com';
  raise notice 'hublynx.dev = %', v_hub;
  for t in
    select c1.table_name from information_schema.columns c1
    join information_schema.columns c2 on c2.table_schema = c1.table_schema and c2.table_name = c1.table_name
    join information_schema.tables tb on tb.table_schema = c1.table_schema and tb.table_name = c1.table_name and tb.table_type = 'BASE TABLE'
    where c1.table_schema = 'public' and c1.column_name = 'owner_id' and c2.column_name = 'organization_id'
    order by 1
  loop
    execute format('select count(*) from public.%I where organization_id = %L', t, 'bb176c8f-59db-4d67-89ba-9ef29767ae29') into n_val;
    execute format('select count(*) from public.%I where organization_id = %L and owner_id = %L', t, 'bb176c8f-59db-4d67-89ba-9ef29767ae29', v_hub) into n_hub_val;
    execute format('select count(*) from public.%I where organization_id is null and owner_id = %L', t, v_hub) into n_null;
    if n_val > 0 or n_null > 0 then
      raise notice '% | Valesafe: % | Valesafe com dono hublynx.dev: % | sem empresa (dono hublynx.dev): %', t, n_val, n_hub_val, n_null;
    end if;
  end loop;
end $$;
-- (o resultado do bloco 3 aparece na aba "Messages"/"Notices" do SQL Editor)

-- 4) Pipelines, projetos e formulários de cada empresa — para conferir se algum
--    da Valesafe está gravado na Hublynx (ou o contrário)
select 'pipeline' as tipo, o.slug as empresa, p.name as nome, p.created_at
from public.pipelines p left join public.organizations o on o.id = p.organization_id
where p.organization_id in ('2d4ce02e-5e15-4b0d-8192-0ca9a63aff1f', 'bb176c8f-59db-4d67-89ba-9ef29767ae29') or p.organization_id is null
union all
select 'projeto', o.slug, pr.name, pr.created_at
from public.projects pr left join public.organizations o on o.id = pr.organization_id
where pr.organization_id in ('2d4ce02e-5e15-4b0d-8192-0ca9a63aff1f', 'bb176c8f-59db-4d67-89ba-9ef29767ae29') or pr.organization_id is null
union all
select 'formulario', o.slug, f.name, f.created_at
from public.forms f left join public.organizations o on o.id = f.organization_id
where f.organization_id in ('2d4ce02e-5e15-4b0d-8192-0ca9a63aff1f', 'bb176c8f-59db-4d67-89ba-9ef29767ae29') or f.organization_id is null
order by 1, 2, 3;

-- 5) Assinatura e módulos da Valesafe hoje
select s.plan, s.status, s.price_monthly, s.current_period_end, s.account_name
from public.subscriptions s where s.organization_id = 'bb176c8f-59db-4d67-89ba-9ef29767ae29';
select md.code, om.enabled
from public.organization_modules om join public.modules md on md.id = om.module_id
where om.organization_id = 'bb176c8f-59db-4d67-89ba-9ef29767ae29';
