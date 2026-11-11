-- 39b — Valesafe Expansão vira ASSINANTE separada da Hublynx (rodar só depois do 39a conferido)
--
-- O que faz, tudo numa transação (ou faz tudo, ou nada):
--  1. Guarda cópia de tudo que vai mudar no esquema backup_39 (para desfazer).
--  2. Passa a dona dos registros da Valesafe de hublynx.dev@gmail.com para a pessoa
--     responsável da Valesafe (leads, pipeline, etapas, projetos, tarefas, formulários, ...).
--  3. Garante essa pessoa como administradora da Valesafe, com os módulos da empresa.
--  4. Tira hublynx.dev@gmail.com da equipe da Valesafe. Ela continua podendo atender a
--     Valesafe pelo seletor de empresas em "modo suporte" (migração 29), sem misturar dados.
--  5. Marca a Valesafe como assinante ativa (Plano Core).
--
-- NÃO apaga dados, NÃO move nada da Hublynx e NÃO mexe nas outras pessoas da Valesafe.
--
-- ANTES DE RODAR: troque o e-mail abaixo (linha "v_admin_email") pelo da pessoa que será a
-- administradora da Valesafe. Ela precisa já ter conta no Core (aparece no bloco 2 do 39a).

begin;

create schema if not exists backup_39;

do $$
declare
  v_admin_email text := 'TROCAR-PELO-EMAIL@valesafe.com.br';   -- <<< responsável da Valesafe
  v_price numeric := 169.90;                                    -- <<< mensalidade da Valesafe
  v_val uuid := 'bb176c8f-59db-4d67-89ba-9ef29767ae29';
  v_hub uuid;
  v_admin uuid;
  t text; col text; n bigint;
begin
  select id into v_hub from auth.users where lower(email) = 'hublynx.dev@gmail.com';
  select id into v_admin from auth.users where lower(email) = lower(v_admin_email);
  if v_hub is null then raise exception 'Conta hublynx.dev@gmail.com não encontrada'; end if;
  if v_admin is null then raise exception 'Conta % não encontrada: crie a pessoa da Valesafe no Core antes', v_admin_email; end if;
  if v_admin = v_hub then raise exception 'A responsável da Valesafe precisa ser outra conta'; end if;

  -- 1+2a) tabelas com empresa e dono: registros da Valesafe que estão no nome da hublynx.dev
  for t in
    select c1.table_name from information_schema.columns c1
    join information_schema.columns c2 on c2.table_schema = c1.table_schema and c2.table_name = c1.table_name
    join information_schema.tables tb on tb.table_schema = c1.table_schema and tb.table_name = c1.table_name and tb.table_type = 'BASE TABLE'
    where c1.table_schema = 'public' and c1.column_name = 'owner_id' and c2.column_name = 'organization_id'
  loop
    execute format('create table if not exists backup_39.%I as select id, owner_id from public.%I where false', t, t);
    execute format('insert into backup_39.%I select id, owner_id from public.%I where organization_id = %L and owner_id = %L',
                   t, t, v_val, v_hub);
    execute format('update public.%I set owner_id = %L where organization_id = %L and owner_id = %L', t, v_admin, v_val, v_hub);
    get diagnostics n = row_count;
    if n > 0 then raise notice '% → % registros passados para a Valesafe', t, n; end if;
  end loop;

  -- 2b) tabelas só com dono (filhas): ligadas a um pai da Valesafe por task_id/project_id/form_id/lead_id
  for t, col in
    select c1.table_name, c3.column_name from information_schema.columns c1
    join information_schema.tables tb on tb.table_schema = c1.table_schema and tb.table_name = c1.table_name and tb.table_type = 'BASE TABLE'
    join information_schema.columns c3 on c3.table_schema = c1.table_schema and c3.table_name = c1.table_name
         and c3.column_name in ('task_id', 'project_id', 'form_id', 'lead_id')
    where c1.table_schema = 'public' and c1.column_name = 'owner_id'
      and not exists (select 1 from information_schema.columns c2 where c2.table_schema = 'public'
                      and c2.table_name = c1.table_name and c2.column_name = 'organization_id')
      and exists (select 1 from information_schema.columns ci where ci.table_schema = 'public'
                  and ci.table_name = c1.table_name and ci.column_name = 'id')
  loop
    execute format('create table if not exists backup_39.%I as select id, owner_id from public.%I where false', t || '__' || col, t);
    execute format(
      'insert into backup_39.%I select x.id, x.owner_id from public.%I x where x.owner_id = %L and x.%I in (select id from public.%I where organization_id = %L)',
      t || '__' || col, t, v_hub, col,
      case col when 'task_id' then 'tasks' when 'project_id' then 'projects' when 'form_id' then 'forms' else 'leads' end, v_val);
    execute format(
      'update public.%I x set owner_id = %L where x.owner_id = %L and x.%I in (select id from public.%I where organization_id = %L)',
      t, v_admin, v_hub, col,
      case col when 'task_id' then 'tasks' when 'project_id' then 'projects' when 'form_id' then 'forms' else 'leads' end, v_val);
    get diagnostics n = row_count;
    if n > 0 then raise notice '% (por %) → % registros', t, col, n; end if;
  end loop;

  -- 3) responsável da Valesafe como administradora, com os módulos da empresa
  create table if not exists backup_39.organization_members as
    select * from public.organization_members where organization_id = v_val;
  create table if not exists backup_39.user_module_permissions as
    select * from public.user_module_permissions where organization_id = v_val;
  create table if not exists backup_39.organizations as
    select * from public.organizations where id = v_val;
  create table if not exists backup_39.subscriptions as
    select * from public.subscriptions where organization_id = v_val;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_val, v_admin, 'org_admin', 'active')
  on conflict (organization_id, user_id) do update set role = 'org_admin', status = 'active';

  insert into public.user_module_permissions (organization_id, user_id, module_id, can_access)
  select v_val, v_admin, om.module_id, true
  from public.organization_modules om where om.organization_id = v_val and om.enabled
  on conflict do nothing;

  -- 4) hublynx.dev sai da equipe da Valesafe (continua atendendo em modo suporte)
  delete from public.user_module_permissions where organization_id = v_val and user_id = v_hub;
  delete from public.organization_members where organization_id = v_val and user_id = v_hub;
  delete from public.platform_admin_context where user_id = v_hub and organization_id = v_val;

  -- 5) Valesafe como assinante ativa
  update public.organizations
     set status = 'active', legacy_owner_id = v_admin, updated_at = now()
   where id = v_val;

  update public.subscriptions
     set plan = 'plano_core', status = 'active', price_monthly = v_price, monthly_price = v_price,
         user_id = v_admin, updated_at = now()
   where organization_id = v_val;
  if not found then
    insert into public.subscriptions (user_id, organization_id, account_name, plan, status, price_monthly, monthly_price, started_at)
    values (v_admin, v_val, 'Valesafe Expansão', 'plano_core', 'active', v_price, v_price, now());
  end if;

  raise notice 'Valesafe separada: dona = %, hublynx.dev fora da equipe', v_admin_email;
end $$;

-- Conferência (precisa mostrar a Valesafe sem a hublynx.dev e com 0 registros dela)
select u.email, m.role, m.status
from public.organization_members m join auth.users u on u.id = m.user_id
where m.organization_id = 'bb176c8f-59db-4d67-89ba-9ef29767ae29' order by u.email;

commit;

-- ============================================================================
-- DESFAZER (só se precisar). Rodar inteiro, de uma vez:
-- ============================================================================
-- begin;
-- do $$ declare t text; begin
--   for t in select table_name from information_schema.tables where table_schema = 'backup_39'
--     and table_name not in ('organization_members','user_module_permissions','organizations','subscriptions') loop
--     execute format('update public.%I x set owner_id = b.owner_id from backup_39.%I b where x.id = b.id',
--                    split_part(t, '__', 1), t);
--   end loop;
-- end $$;
-- delete from public.organization_members where organization_id = 'bb176c8f-59db-4d67-89ba-9ef29767ae29';
-- insert into public.organization_members select * from backup_39.organization_members;
-- delete from public.user_module_permissions where organization_id = 'bb176c8f-59db-4d67-89ba-9ef29767ae29';
-- insert into public.user_module_permissions select * from backup_39.user_module_permissions;
-- update public.organizations o set status = b.status, legacy_owner_id = b.legacy_owner_id
--   from backup_39.organizations b where o.id = b.id;
-- delete from public.subscriptions where organization_id = 'bb176c8f-59db-4d67-89ba-9ef29767ae29';
-- insert into public.subscriptions select * from backup_39.subscriptions;
-- commit;
