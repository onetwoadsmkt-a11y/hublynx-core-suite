-- 08_template_tasks.sql — tarefas padrão por etapa do modelo de roadmap
-- Segue exatamente o padrão multi-tenant já usado em project_template_stages.

create table if not exists public.project_template_tasks (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.project_template_stages(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  due_offset_days integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_template_tasks_stage_idx
  on public.project_template_tasks (stage_id, sort_order);
create index if not exists project_template_tasks_org_idx
  on public.project_template_tasks (organization_id);

grant select, insert, update, delete on public.project_template_tasks to authenticated;
grant all on public.project_template_tasks to service_role;

alter table public.project_template_tasks enable row level security;

drop policy if exists "org all project_template_tasks" on public.project_template_tasks;
create policy "org all project_template_tasks" on public.project_template_tasks
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
