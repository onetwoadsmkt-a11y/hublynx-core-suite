-- ETAPA 1.1 — Fundação multi-tenant: organizations, membros, módulos, permissões.
-- Não altera nenhuma tabela existente. Seguro para reexecutar.

-- ---------- organizations ----------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  logo_url text,
  document text,
  responsible_name text,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active','suspended','cancelled','trial')),
  contracted_users integer not null default 3,
  legacy_owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists organizations_slug_key on public.organizations (slug) where slug is not null;
create index if not exists organizations_legacy_owner_idx on public.organizations (legacy_owner_id);

-- ---------- organization_members ----------
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('org_admin','user','guest')),
  status text not null default 'active' check (status in ('active','inactive','invited')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists organization_members_user_idx on public.organization_members (user_id);

-- ---------- platform_admins (HUBLYNX_SUPER_ADMIN) ----------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- modules ----------
create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  public boolean not null default true,          -- false = interno (ex.: finance nesta fase)
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete restrict,
  enabled boolean not null default true,
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  unique (organization_id, module_id)
);
create index if not exists organization_modules_org_idx on public.organization_modules (organization_id);

create table if not exists public.user_module_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete restrict,
  can_access boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, module_id)
);
create index if not exists ump_user_org_idx on public.user_module_permissions (user_id, organization_id);

-- ---------- grants ----------
grant select, insert, update, delete on public.organizations, public.organization_members,
  public.organization_modules, public.user_module_permissions to authenticated;
grant select on public.modules, public.platform_admins to authenticated;
grant all on public.organizations, public.organization_members, public.platform_admins,
  public.modules, public.organization_modules, public.user_module_permissions to service_role;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.modules enable row level security;
alter table public.organization_modules enable row level security;
alter table public.user_module_permissions enable row level security;

-- ---------- funções (SECURITY DEFINER, sem recursão) ----------
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create or replace function public.org_role(_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when public.is_super_admin() then 'super_admin'
    else (select m.role from public.organization_members m
          where m.organization_id = _org and m.user_id = auth.uid() and m.status = 'active' limit 1) end
$$;

create or replace function public.is_org_admin(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.org_role(_org) in ('super_admin','org_admin')
$$;

create or replace function public.has_module(_org uuid, _code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_modules om
    join public.modules md on md.id = om.module_id
    where om.organization_id = _org and md.code = _code and om.enabled and md.active
  ) and (
    public.is_org_admin(_org) or exists (
      select 1 from public.user_module_permissions p
      join public.modules md on md.id = p.module_id
      where p.organization_id = _org and p.user_id = auth.uid() and md.code = _code and p.can_access
    )
  )
$$;

do $$ declare f text; begin
  foreach f in array array['is_super_admin()','is_org_member(uuid)','org_role(uuid)','is_org_admin(uuid)','has_module(uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------- policies ----------
drop policy if exists "org members read organizations" on public.organizations;
create policy "org members read organizations" on public.organizations for select to authenticated
  using (public.is_org_member(id));
drop policy if exists "org admins update organizations" on public.organizations;
create policy "org admins update organizations" on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));
drop policy if exists "super admin manages organizations" on public.organizations;
create policy "super admin manages organizations" on public.organizations for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "members read memberships" on public.organization_members;
create policy "members read memberships" on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id));
drop policy if exists "org admins manage memberships" on public.organization_members;
create policy "org admins manage memberships" on public.organization_members for all to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

drop policy if exists "read own platform admin" on public.platform_admins;
create policy "read own platform admin" on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "authenticated read modules" on public.modules;
create policy "authenticated read modules" on public.modules for select to authenticated using (true);

drop policy if exists "members read org modules" on public.organization_modules;
create policy "members read org modules" on public.organization_modules for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "super admin manages org modules" on public.organization_modules;
create policy "super admin manages org modules" on public.organization_modules for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "read own or org permissions" on public.user_module_permissions;
create policy "read own or org permissions" on public.user_module_permissions for select to authenticated
  using (user_id = auth.uid() or public.is_org_admin(organization_id));
drop policy if exists "org admins manage permissions" on public.user_module_permissions;
create policy "org admins manage permissions" on public.user_module_permissions for all to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- ---------- seed: módulos ----------
insert into public.modules (code, name, description, active, public, sort_order) values
  ('crm', 'Hublynx CRM', 'Leads, pipeline, clientes, atividades e agenda comercial.', true, true, 1),
  ('projects', 'Hublynx Projects', 'Projetos, roadmaps, tarefas e templates.', true, true, 2),
  ('finance', 'Hublynx Finance', 'Financeiro (interno nesta fase).', true, false, 3)
on conflict (code) do nothing;

-- ---------- migração: workspaces -> organizations (mesmos IDs) ----------
insert into public.organizations (id, name, slug, legacy_owner_id, status, created_at, updated_at)
select w.id, w.name, w.slug, w.legacy_owner_id,
       case when coalesce(w.active, true) then 'active' else 'suspended' end, w.created_at, w.updated_at
from public.workspaces w
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role, status, created_at)
select m.workspace_id, m.user_id,
       case when m.role in ('owner','admin') then 'org_admin' else 'user' end, 'active', m.created_at
from public.workspace_members m
on conflict (organization_id, user_id) do nothing;

-- Ajustes de identidade
update public.organizations set name = 'Hublynx', slug = 'hublynx', contracted_users = 10
 where id = '2d4ce02e-5e15-4b0d-8192-0ca9a63aff1f';
update public.organizations set slug = 'valesafe', contracted_users = 3
 where id = 'bb176c8f-59db-4d67-89ba-9ef29767ae29';

-- Super admin
insert into public.platform_admins (user_id) values ('f60e1d76-8077-48b5-af96-9901a51f14b4') on conflict do nothing;

-- Módulos contratados: Hublynx = crm + projects + finance ; Valesafe = crm
insert into public.organization_modules (organization_id, module_id, enabled)
select '2d4ce02e-5e15-4b0d-8192-0ca9a63aff1f', id, true from public.modules where code in ('crm','projects','finance')
on conflict do nothing;
insert into public.organization_modules (organization_id, module_id, enabled)
select 'bb176c8f-59db-4d67-89ba-9ef29767ae29', id, true from public.modules where code = 'crm'
on conflict do nothing;

-- Permissões iniciais: cada membro atual recebe acesso aos módulos da sua organização
insert into public.user_module_permissions (organization_id, user_id, module_id, can_access)
select om.organization_id, m.user_id, om.module_id, true
from public.organization_modules om
join public.organization_members m on m.organization_id = om.organization_id
on conflict do nothing;

-- Verificação
select (select count(*) from public.organizations) as organizations,
       (select count(*) from public.organization_members) as members,
       (select count(*) from public.organization_modules) as org_modules,
       (select count(*) from public.user_module_permissions) as permissions,
       (select count(*) from public.platform_admins) as super_admins;
