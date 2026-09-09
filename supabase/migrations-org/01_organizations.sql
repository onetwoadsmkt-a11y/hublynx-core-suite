-- Fase 1 — cria as tabelas de organização (tenant) sem tocar em nada existente.
-- Seguro para reexecutar.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  legacy_owner_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organizations_slug_key on public.organizations (slug) where slug is not null;
create index if not exists organizations_legacy_owner_idx on public.organizations (legacy_owner_id);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_user_idx on public.organization_members (user_id);

grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;
grant select, insert, update, delete on public.organization_members to authenticated;
grant all on public.organization_members to service_role;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- Função de pertencimento (SECURITY DEFINER evita recursão de RLS).
create or replace function public.is_org_member(_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = auth.uid()
  )
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;

drop policy if exists "org members read organizations" on public.organizations;
create policy "org members read organizations"
  on public.organizations for select to authenticated
  using (public.is_org_member(id));

drop policy if exists "org members read own membership" on public.organization_members;
create policy "org members read own membership"
  on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id));

-- Copia os workspaces existentes preservando os mesmos IDs
-- (assim leads.workspace_id já aponta para uma organização válida).
insert into public.organizations (id, name, slug, legacy_owner_id, active, created_at, updated_at)
select w.id, w.name, w.slug, w.legacy_owner_id, coalesce(w.active, true), w.created_at, w.updated_at
from public.workspaces w
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role, created_at)
select m.workspace_id, m.user_id, coalesce(m.role, 'member'), m.created_at
from public.workspace_members m
on conflict (organization_id, user_id) do nothing;

-- Verificação
select (select count(*) from public.organizations) as organizations,
       (select count(*) from public.organization_members) as members;
