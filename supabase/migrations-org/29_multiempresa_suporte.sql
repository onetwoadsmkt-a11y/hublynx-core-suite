-- 29 — Multiempresa: o administrador da Hublynx não vê dados de assinantes misturados (30/10/2026)
-- Antes: o administrador da plataforma passava em todas as regras de todas as empresas,
-- então telas sem filtro de empresa mostravam dados de assinantes junto com os da Hublynx.
-- Agora:
--  * Na(s) empresa(s) em que ele é membro (Hublynx) vê só os dados dela(s).
--  * Para atender um assinante ele escolhe a empresa no seletor do Core ("modo suporte"):
--    enquanto isso vê SOMENTE os dados daquela empresa (nem os da Hublynx aparecem juntos).
--  * Usuários comuns: nada muda (mesma regra de membro ativo, sem convidado do portal).
--  * Central Administrativa e rotinas do servidor (service role) continuam vendo tudo.
-- Pode rodar mais de uma vez.

begin;

create table if not exists public.platform_admin_context (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.platform_admin_context enable row level security;
drop policy if exists "own support context" on public.platform_admin_context;
create policy "own support context" on public.platform_admin_context for select to authenticated
  using (user_id = auth.uid());
grant select on public.platform_admin_context to authenticated;
grant all on public.platform_admin_context to service_role;

-- empresa atendida em modo suporte (só administrador da plataforma; vazio = nenhuma)
create or replace function public.support_org()
returns uuid language sql stable security definer set search_path = public as $$
  select c.organization_id from public.platform_admin_context c
  where c.user_id = auth.uid() and public.is_super_admin()
$$;

create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.support_org() is not null then _org = public.support_org()
    else exists (
      select 1 from public.organization_members m
      where m.organization_id = _org and m.user_id = auth.uid()
        and m.status = 'active' and m.role <> 'guest')
  end
$$;

create or replace function public.org_role(_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.support_org() is not null then
      case when _org = public.support_org() then 'super_admin' end
    when public.is_super_admin() and exists (
      select 1 from public.organization_members m
      where m.organization_id = _org and m.user_id = auth.uid() and m.status = 'active') then 'super_admin'
    else (select m.role from public.organization_members m
          where m.organization_id = _org and m.user_id = auth.uid() and m.status = 'active' limit 1)
  end
$$;

-- escolhe a empresa atendida (empresa em que ele é membro ou vazio = sai do modo suporte)
create or replace function public.set_support_org(_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then return null; end if;
  if _org is null or exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = auth.uid() and m.status = 'active') then
    delete from public.platform_admin_context where user_id = auth.uid();
    return null;
  end if;
  insert into public.platform_admin_context (user_id, organization_id, updated_at)
  values (auth.uid(), _org, now())
  on conflict (user_id) do update set organization_id = excluded.organization_id, updated_at = now();
  return _org;
end $$;
revoke all on function public.set_support_org(uuid) from public, anon;
grant execute on function public.set_support_org(uuid) to authenticated;

-- regra extra (restritiva) para o modo suporte: nem as linhas "minhas" (owner_id) de outra
-- empresa aparecem. Para quem não está em modo suporte ela é sempre verdadeira.
create or replace function public.support_scope_ok(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.support_org() is null or _org is null or _org = public.support_org()
$$;

do $$
declare t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col
      on col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'organization_id'
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname not in ('organizations', 'organization_members', 'platform_admin_context')
  loop
    execute format('drop policy if exists "support scope" on public.%I', t);
    execute format($p$create policy "support scope" on public.%I as restrictive for all to authenticated
      using (public.support_scope_ok(organization_id)) with check (public.support_scope_ok(organization_id))$p$, t);
  end loop;
end $$;

commit;

-- Conferência (opcional): select public.support_org(); select count(*) from public.leads;
