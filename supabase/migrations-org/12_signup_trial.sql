-- Cadastro automático com 14 dias de teste. REVISAR E APLICAR MANUALMENTE.
-- Não provisiona contas existentes, não altera administradores ou dados empresariais.
-- Pré-requisitos: 01..06 e 09 aplicados; conferir gatilhos existentes de auth.users.
begin;

alter table public.organizations add column if not exists trial_expires_at timestamptz;

create or replace function public.trial_access_allowed(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.organizations o where o.id = _org
    and (o.trial_expires_at is null or o.status = 'active'
      or (o.status = 'trial' and now() < o.trial_expires_at))
  )
$$;
revoke all on function public.trial_access_allowed(uuid) from public, anon;
grant execute on function public.trial_access_allowed(uuid) to authenticated, service_role;

-- Um administrador da empresa não pode estender nem remover o próprio teste.
create or replace function public.protect_trial_terms()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.trial_expires_at is not null
     and (new.trial_expires_at is distinct from old.trial_expires_at
       or new.status is distinct from old.status)
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin() then
    raise exception 'Somente a administração da plataforma pode alterar o teste.';
  end if;
  return new;
end $$;
revoke all on function public.protect_trial_terms() from public, anon, authenticated;
drop trigger if exists trg_protect_trial_terms on public.organizations;
create trigger trg_protect_trial_terms before update on public.organizations
for each row execute function public.protect_trial_terms();

create or replace function public.provision_signup_trial()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  started timestamptz := coalesce(new.created_at, now());
  expires timestamptz;
  display_name text;
begin
  -- Só app_metadata, gravado pelo servidor, pode indicar cadastro administrativo.
  if new.raw_app_meta_data ->> 'account_provisioning' = 'administrative' then
    return new;
  end if;
  expires := started + interval '336 hours'; -- exatamente 14 x 24 horas
  display_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Minha empresa'), 160);
  if (select count(*) from public.modules where active and code in ('crm','tasks','projects')) <> 3 then
    raise exception 'Catálogo de módulos do teste incompleto. Aplique o catálogo antes de liberar cadastros.';
  end if;
  insert into public.organizations(name, status, contracted_users, legacy_owner_id, trial_expires_at)
  values (display_name, 'trial', 1, new.id, expires) returning id into org_id;
  insert into public.organization_members(organization_id, user_id, role, status)
  values (org_id, new.id, 'org_admin', 'active');
  insert into public.organization_modules(organization_id, module_id, enabled)
  select org_id, id, true from public.modules where active and code in ('crm','tasks','projects');
  insert into public.user_module_permissions(organization_id, user_id, module_id, can_access)
  select org_id, new.id, id, true from public.modules where active and code in ('crm','tasks','projects');
  insert into public.subscriptions(user_id, organization_id, account_name, plan, status,
    price_monthly, capabilities, current_period_end, created_at)
  values (new.id, org_id, display_name, 'teste_14_dias', 'trial', 0,
    array['hub','comercial','operacao','configuracoes']::text[], expires::date, started);
  return new;
end $$;
revoke all on function public.provision_signup_trial() from public, anon, authenticated;
drop trigger if exists trg_provision_signup_trial on auth.users;
create trigger trg_provision_signup_trial after insert on auth.users
for each row execute function public.provision_signup_trial();

-- Policies RESTRITIVAS: vencimento bloqueia mesmo com policies legadas permissivas.
-- A empresa continua legível para mostrar a mensagem de teste encerrado.
do $$ declare t record; begin
  for t in select c.table_name from information_schema.columns c
    join pg_tables p on p.schemaname = c.table_schema and p.tablename = c.table_name
    where c.table_schema = 'public' and c.column_name = 'organization_id' and p.rowsecurity
  loop
    execute format('drop policy if exists "trial expiry guard" on public.%I', t.table_name);
    execute format('create policy "trial expiry guard" on public.%I as restrictive for all to authenticated
      using (organization_id is null or public.trial_access_allowed(organization_id))
      with check (organization_id is null or public.trial_access_allowed(organization_id))', t.table_name);
  end loop;
end $$;
drop policy if exists "trial storage expiry guard" on storage.objects;
create policy "trial storage expiry guard" on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'org-files' or public.trial_access_allowed((storage.foldername(name))[1]::uuid))
with check (bucket_id <> 'org-files' or public.trial_access_allowed((storage.foldername(name))[1]::uuid));

commit;