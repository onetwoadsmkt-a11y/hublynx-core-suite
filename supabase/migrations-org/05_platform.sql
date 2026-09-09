-- ETAPA 1.5 — tabelas da plataforma: preços, faixas de recursos, simulações,
-- assinatura por módulo, templates/roadmap de projetos, utilização e arquivos externos.
-- Somente cria tabelas novas. Seguro para reexecutar.

-- ---------- pricing_config (com histórico) ----------
create table if not exists public.pricing_config (
  id uuid primary key default gen_random_uuid(),
  key text not null,                       -- crm_monthly_price | projects_monthly_price | included_users | additional_user_price
  value numeric(12,2) not null,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  changed_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists pricing_config_key_active_idx on public.pricing_config (key, active, valid_from desc);

insert into public.pricing_config (key, value, note)
select v.key, v.value, 'valor inicial' from (values
  ('crm_monthly_price', 297::numeric), ('projects_monthly_price', 149::numeric),
  ('included_users', 3::numeric), ('additional_user_price', 39::numeric)
) as v(key, value)
where not exists (select 1 from public.pricing_config p where p.key = v.key);

-- ---------- resource_tiers ----------
create table if not exists public.resource_tiers (
  id uuid primary key default gen_random_uuid(),
  name text,
  min_users integer not null,
  max_users integer,                       -- null = acima de (customizado)
  database_limit_mb integer not null,
  storage_limit_mb integer not null,
  custom boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.resource_tiers (name, min_users, max_users, database_limit_mb, storage_limit_mb, custom)
select * from (values
  ('Até 3 usuários', 1, 3, 250, 2048, false),
  ('4 a 10 usuários', 4, 10, 500, 5120, false),
  ('11 a 25 usuários', 11, 25, 1024, 10240, false),
  ('26 a 50 usuários', 26, 50, 2048, 20480, false),
  ('Acima de 50', 51, null, 0, 0, true)
) as v(name, min_users, max_users, database_limit_mb, storage_limit_mb, custom)
where not exists (select 1 from public.resource_tiers);

-- ---------- commercial_simulations ----------
create table if not exists public.commercial_simulations (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  modules text[] not null default '{}',    -- códigos: crm, projects
  total_users integer not null default 3,
  module_total numeric(12,2) not null default 0,
  additional_users integer not null default 0,
  user_total numeric(12,2) not null default 0,
  monthly_total numeric(12,2) not null default 0,
  annual_total numeric(12,2) not null default 0,
  database_limit_mb integer,
  storage_limit_mb integer,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','proposal','approved','converted','lost')),
  organization_id uuid references public.organizations(id),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- subscription_modules ----------
create table if not exists public.subscription_modules (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  module_id uuid not null references public.modules(id),
  price_at_contract numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (subscription_id, module_id)
);

-- ---------- templates de projeto ----------
create table if not exists public.project_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.project_template_stages (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.project_templates(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  duration_days integer,
  default_tasks jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb
);
create index if not exists project_template_stages_tpl_idx on public.project_template_stages (template_id, sort_order);

-- ---------- etapas do roadmap (relacional) ----------
create table if not exists public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  responsible_id uuid references auth.users(id),
  start_date date,
  due_date date,
  status text not null default 'not_started' check (status in ('not_started','in_progress','waiting','blocked','done')),
  percent integer not null default 0 check (percent between 0 and 100),
  depends_on uuid[] not null default '{}',
  checklist jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_stages_project_idx on public.project_stages (project_id, sort_order);
alter table public.tasks add column if not exists stage_id uuid references public.project_stages(id) on delete set null;

-- ---------- utilização ----------
create table if not exists public.organization_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  database_mb numeric(12,2) not null default 0,
  storage_mb numeric(12,2) not null default 0,
  users_count integer not null default 0,
  measured_at timestamptz not null default now()
);
create index if not exists organization_usage_org_idx on public.organization_usage (organization_id, measured_at desc);

-- ---------- arquivos externos (Google Drive) ----------
create table if not exists public.external_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'google_drive',
  drive_file_id text,
  drive_url text,
  name text,
  mime_type text,
  related_type text not null,              -- lead | customer | project
  related_id uuid not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists external_files_related_idx on public.external_files (organization_id, related_type, related_id);

-- ---------- grants ----------
grant select on public.pricing_config, public.resource_tiers to authenticated;
grant select, insert, update, delete on public.commercial_simulations, public.subscription_modules,
  public.project_templates, public.project_template_stages, public.project_stages,
  public.organization_usage, public.external_files to authenticated;
grant all on public.pricing_config, public.resource_tiers, public.commercial_simulations,
  public.subscription_modules, public.project_templates, public.project_template_stages,
  public.project_stages, public.organization_usage, public.external_files to service_role;

-- ---------- RLS ----------
alter table public.pricing_config enable row level security;
alter table public.resource_tiers enable row level security;
alter table public.commercial_simulations enable row level security;
alter table public.subscription_modules enable row level security;
alter table public.project_templates enable row level security;
alter table public.project_template_stages enable row level security;
alter table public.project_stages enable row level security;
alter table public.organization_usage enable row level security;
alter table public.external_files enable row level security;

drop policy if exists "authenticated read pricing" on public.pricing_config;
create policy "authenticated read pricing" on public.pricing_config for select to authenticated using (true);
drop policy if exists "authenticated read tiers" on public.resource_tiers;
create policy "authenticated read tiers" on public.resource_tiers for select to authenticated using (true);

drop policy if exists "super admin simulations" on public.commercial_simulations;
create policy "super admin simulations" on public.commercial_simulations for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "read subscription modules" on public.subscription_modules;
create policy "read subscription modules" on public.subscription_modules for select to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.subscriptions s where s.id = subscription_id and s.organization_id is not null and public.is_org_member(s.organization_id)));
drop policy if exists "super admin subscription modules" on public.subscription_modules;
create policy "super admin subscription modules" on public.subscription_modules for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

do $$
declare t text;
begin
  foreach t in array array['project_templates','project_template_stages','project_stages','external_files'] loop
    execute format('drop policy if exists "org all %s" on public.%I', t, t);
    execute format($p$create policy "org all %s" on public.%I for all to authenticated
      using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))$p$, t, t);
  end loop;
end $$;

drop policy if exists "org read usage" on public.organization_usage;
create policy "org read usage" on public.organization_usage for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "super admin usage" on public.organization_usage;
create policy "super admin usage" on public.organization_usage for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------- RPC de utilização (tamanho do banco/storage por organização) ----------
create or replace function public.measure_organization_usage(_org uuid)
returns table (database_mb numeric, storage_mb numeric, users_count integer)
language plpgsql stable security definer set search_path = public as $$
declare t text; total_bytes bigint := 0; n bigint; row_bytes numeric;
begin
  if not public.is_org_member(_org) then raise exception 'forbidden'; end if;
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'organization_id' loop
    execute format('select count(*) from public.%I where organization_id = $1', t) into n using _org;
    if n > 0 then
      execute format('select coalesce(pg_total_relation_size(''public.%I'')::numeric / nullif((select count(*) from public.%I),0), 0)', t, t) into row_bytes;
      total_bytes := total_bytes + (row_bytes * n)::bigint;
    end if;
  end loop;
  return query
    select round(total_bytes / 1048576.0, 2),
           round(coalesce((select sum((o.metadata->>'size')::numeric) from storage.objects o
                            where o.bucket_id = 'org-files' and (storage.foldername(o.name))[1] = _org::text), 0) / 1048576.0, 2),
           (select count(*)::integer from public.organization_members m where m.organization_id = _org and m.status = 'active');
end $$;
revoke all on function public.measure_organization_usage(uuid) from public, anon;
grant execute on function public.measure_organization_usage(uuid) to authenticated, service_role;

-- ---------- migração do roadmap JSONB atual -> project_stages (idempotente) ----------
insert into public.project_stages (project_id, organization_id, name, description, sort_order, status, percent)
select p.id, p.organization_id, coalesce(s->>'name', s->>'title', 'Etapa'), s->>'description', ord - 1,
       case when coalesce((s->>'done')::boolean, false) or s->>'status' in ('done','concluido','concluído') then 'done'
            when s->>'status' in ('in_progress','em_andamento') then 'in_progress' else 'not_started' end,
       case when coalesce((s->>'done')::boolean, false) then 100 else coalesce((s->>'percent')::int, 0) end
from public.projects p,
     lateral jsonb_array_elements(case when jsonb_typeof(p.roadmap_stages) = 'array' then p.roadmap_stages else '[]'::jsonb end) with ordinality as e(s, ord)
where p.organization_id is not null
  and not exists (select 1 from public.project_stages ps where ps.project_id = p.id);

-- Verificação
select (select count(*) from public.pricing_config) as prices,
       (select count(*) from public.resource_tiers) as tiers,
       (select count(*) from public.project_stages) as stages;
