-- =====================================================================
-- 13 — Permissões por projeto, portal do cliente e departamentos de custo
-- (Fases 2, 3 e 4). Idempotente: pode ser rodado mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Cliente do portal (papel 'guest') NÃO é equipe da empresa
-- ---------------------------------------------------------------------
create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = auth.uid()
      and m.status = 'active' and m.role <> 'guest'
  )
$$;

create or replace function public.is_org_guest(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = auth.uid()
      and m.status = 'active' and m.role = 'guest'
  )
$$;

-- o cliente enxerga nome/logo/cor da empresa no portal
drop policy if exists "org guests read organizations" on public.organizations;
create policy "org guests read organizations" on public.organizations
  for select to authenticated using (public.is_org_guest(id));

-- ---------------------------------------------------------------------
-- B) Fase 2 — papéis por projeto
-- ---------------------------------------------------------------------
alter table public.organizations
  add column if not exists projects_restricted boolean not null default false;

alter table public.project_members
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists access_role text not null default 'editor',
  add column if not exists status text not null default 'active',
  add column if not exists invited_at timestamptz;

do $$ begin
  alter table public.project_members
    add constraint project_members_access_role_chk
    check (access_role in ('gestor','editor','executor','visualizador','cliente'));
exception when duplicate_object then null; end $$;

update public.project_members pm
   set organization_id = p.organization_id
  from public.projects p
 where p.id = pm.project_id and pm.organization_id is null;

create unique index if not exists project_members_project_user_uq
  on public.project_members (project_id, user_id) where user_id is not null;
create index if not exists project_members_user_idx on public.project_members (user_id);

create or replace function public.tg_project_members_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select p.organization_id into new.organization_id from public.projects p where p.id = new.project_id;
  if new.owner_id is null then new.owner_id := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_project_members_org on public.project_members;
create trigger trg_project_members_org before insert or update of project_id on public.project_members
  for each row execute function public.tg_project_members_org();

create or replace function public.project_role(_project uuid)
returns text language sql stable security definer set search_path = public as $$
  select pm.access_role from public.project_members pm
  where pm.project_id = _project and pm.user_id = auth.uid() and pm.status = 'active'
  order by case pm.access_role when 'gestor' then 0 when 'editor' then 1 when 'executor' then 2
                               when 'visualizador' then 3 else 4 end
  limit 1
$$;

-- Equipe (não cliente) que pode ver o projeto
create or replace function public.can_view_project(_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    left join public.organizations o on o.id = p.organization_id
    where p.id = _project and (
      public.is_org_admin(p.organization_id)
      or p.owner_id = auth.uid()
      or (public.is_org_member(p.organization_id)
          and (not coalesce(o.projects_restricted, false)
               or coalesce(public.project_role(p.id), 'cliente') <> 'cliente'))
    )
  )
$$;

create or replace function public.can_edit_project(_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    left join public.organizations o on o.id = p.organization_id
    where p.id = _project and (
      public.is_org_admin(p.organization_id)
      or p.owner_id = auth.uid()
      or (public.is_org_member(p.organization_id) and (
            public.project_role(p.id) in ('gestor','editor')
            or (public.project_role(p.id) is null and not coalesce(o.projects_restricted, false))))
    )
  )
$$;

create or replace function public.can_manage_project(_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    left join public.organizations o on o.id = p.organization_id
    where p.id = _project and (
      public.is_org_admin(p.organization_id)
      or p.owner_id = auth.uid()
      or (public.is_org_member(p.organization_id) and (
            public.project_role(p.id) = 'gestor'
            or (public.project_role(p.id) is null and not coalesce(o.projects_restricted, false))))
    )
  )
$$;

create or replace function public.is_project_client(_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = _project and pm.user_id = auth.uid()
      and pm.status = 'active' and pm.access_role = 'cliente'
  )
$$;

-- Projetos
drop policy if exists "org select projects" on public.projects;
drop policy if exists "org update projects" on public.projects;
drop policy if exists "org delete projects" on public.projects;
create policy "org select projects" on public.projects for select to authenticated
  using (organization_id is not null and public.can_view_project(id));
create policy "org update projects" on public.projects for update to authenticated
  using (organization_id is not null and public.can_edit_project(id))
  with check (organization_id is not null and public.is_org_member(organization_id));
create policy "org delete projects" on public.projects for delete to authenticated
  using (organization_id is not null and public.can_manage_project(id));

-- Etapas do roadmap
drop policy if exists "org all project_stages" on public.project_stages;
drop policy if exists "project stages read" on public.project_stages;
drop policy if exists "project stages write" on public.project_stages;
create policy "project stages read" on public.project_stages for select to authenticated
  using (public.can_view_project(project_id));
create policy "project stages write" on public.project_stages for all to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id) and public.is_org_member(organization_id));

-- Membros do projeto
drop policy if exists "Own members" on public.project_members;
drop policy if exists "project members read" on public.project_members;
drop policy if exists "project members manage" on public.project_members;
create policy "project members read" on public.project_members for select to authenticated
  using (public.can_view_project(project_id) or user_id = auth.uid());
create policy "project members manage" on public.project_members for all to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

-- Tarefas: equipe conforme o projeto; executor só nas tarefas dele
alter table public.tasks
  add column if not exists responsible_type text not null default 'equipe',
  add column if not exists visible_to_client boolean not null default false;
do $$ begin
  alter table public.tasks add constraint tasks_responsible_type_chk
    check (responsible_type in ('equipe','cliente'));
exception when duplicate_object then null; end $$;

drop policy if exists "org select tasks" on public.tasks;
drop policy if exists "org insert tasks" on public.tasks;
drop policy if exists "org update tasks" on public.tasks;
drop policy if exists "org delete tasks" on public.tasks;
create policy "org select tasks" on public.tasks for select to authenticated
  using (organization_id is not null and public.is_org_member(organization_id)
         and (project_id is null or public.can_view_project(project_id)));
create policy "org insert tasks" on public.tasks for insert to authenticated
  with check (organization_id is not null and public.is_org_member(organization_id)
              and (project_id is null or public.can_edit_project(project_id)));
create policy "org update tasks" on public.tasks for update to authenticated
  using (organization_id is not null and public.is_org_member(organization_id)
         and (project_id is null or public.can_edit_project(project_id)
              or (public.project_role(project_id) = 'executor' and assignee_id = auth.uid())))
  with check (organization_id is not null and public.is_org_member(organization_id));
create policy "org delete tasks" on public.tasks for delete to authenticated
  using (organization_id is not null and public.is_org_member(organization_id)
         and (project_id is null or public.can_edit_project(project_id)));

-- Comentários: toda a equipe que vê a tarefa lê os comentários (inclusive os do cliente)
create or replace function public.can_view_task(_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tasks t
    where t.id = _task and t.organization_id is not null
      and public.is_org_member(t.organization_id)
      and (t.project_id is null or public.can_view_project(t.project_id))
  )
$$;
drop policy if exists "team reads task comments" on public.task_comments;
drop policy if exists "team writes task comments" on public.task_comments;
create policy "team reads task comments" on public.task_comments for select to authenticated
  using (public.can_view_task(task_id));
create policy "team writes task comments" on public.task_comments for insert to authenticated
  with check (owner_id = auth.uid() and public.can_view_task(task_id));

-- ---------------------------------------------------------------------
-- C) Tarefa concluída grava a data e atualiza a etapa do roadmap
-- ---------------------------------------------------------------------
create or replace function public.tg_tasks_completion()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'concluido' then
    if tg_op = 'INSERT' or old.status is distinct from 'concluido' or new.completed_at is null then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_tasks_completion on public.tasks;
create trigger trg_tasks_completion before insert or update of status, completed_at on public.tasks
  for each row execute function public.tg_tasks_completion();

create or replace function public.refresh_project_stage(_stage uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_total int; v_done int;
begin
  if _stage is null then return; end if;
  select count(*), count(*) filter (where status = 'concluido')
    into v_total, v_done
    from public.tasks where stage_id = _stage and status <> 'cancelado';
  if v_total = 0 then return; end if;
  update public.project_stages s set
    percent = round(100.0 * v_done / v_total),
    status = case when v_done = v_total then 'done'
                  when v_done > 0 then 'in_progress'
                  else 'not_started' end,
    updated_at = now()
  where s.id = _stage;
end $$;

create or replace function public.tg_tasks_stage_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.refresh_project_stage(old.stage_id); end if;
  if tg_op in ('INSERT','UPDATE') and (tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id
      or new.status is distinct from old.status) then
    perform public.refresh_project_stage(new.stage_id);
  end if;
  return null;
end $$;
drop trigger if exists trg_tasks_stage_progress on public.tasks;
create trigger trg_tasks_stage_progress after insert or update or delete on public.tasks
  for each row execute function public.tg_tasks_stage_progress();

-- conserta tarefas já concluídas sem data
update public.tasks set completed_at = coalesce(updated_at, now())
 where status = 'concluido' and completed_at is null;

-- ---------------------------------------------------------------------
-- D) Tarefas padrão dos modelos (tabela nunca criada) + responsável
-- ---------------------------------------------------------------------
create table if not exists public.project_template_tasks (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.project_template_stages(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  due_offset_days integer not null default 0,
  sort_order integer not null default 0,
  responsible_type text not null default 'equipe',
  visible_to_client boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.project_template_tasks
  add column if not exists responsible_type text not null default 'equipe',
  add column if not exists visible_to_client boolean not null default false;
create index if not exists project_template_tasks_stage_idx on public.project_template_tasks (stage_id, sort_order);
create index if not exists project_template_tasks_org_idx on public.project_template_tasks (organization_id);
grant select, insert, update, delete on public.project_template_tasks to authenticated;
grant all on public.project_template_tasks to service_role;
alter table public.project_template_tasks enable row level security;
drop policy if exists "org all project_template_tasks" on public.project_template_tasks;
create policy "org all project_template_tasks" on public.project_template_tasks
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------
-- E) Fase 3 — portal do cliente (acesso só por funções, sem ler as tabelas)
-- ---------------------------------------------------------------------
create or replace function public.portal_my_projects()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'status', p.status,
    'start_date', p.start_date, 'due_date', p.due_date,
    'organization', jsonb_build_object('name', o.name, 'logo_url', o.logo_url, 'brand_color', o.brand_color),
    'stages_total', (select count(*) from project_stages s where s.project_id = p.id),
    'stages_done',  (select count(*) from project_stages s where s.project_id = p.id and s.status = 'done'),
    'progress', coalesce((select round(avg(s.percent)) from project_stages s where s.project_id = p.id), 0),
    'my_open_tasks', (select count(*) from tasks t where t.project_id = p.id
                      and t.responsible_type = 'cliente' and t.status not in ('concluido','cancelado'))
  ) order by p.created_at desc), '[]'::jsonb)
  from public.projects p
  join public.organizations o on o.id = p.organization_id
  where public.is_project_client(p.id)
$$;

create or replace function public.portal_project(_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_project_client(_project) then
    raise exception 'Projeto não encontrado.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'project', jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status,
                 'description', p.description, 'start_date', p.start_date, 'due_date', p.due_date),
    'organization', jsonb_build_object('name', o.name, 'logo_url', o.logo_url, 'brand_color', o.brand_color),
    'stages', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', s.id, 'name', s.name, 'status', s.status, 'percent', s.percent,
                 'start_date', s.start_date, 'due_date', s.due_date) order by s.sort_order)
               from project_stages s where s.project_id = p.id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', t.id, 'stage_id', t.stage_id, 'title', t.title, 'description', t.description,
                 'status', t.status, 'due_date', t.due_date, 'completed_at', t.completed_at,
                 'responsible_type', t.responsible_type,
                 'comments', coalesce((select jsonb_agg(jsonb_build_object(
                      'id', c.id, 'body', c.body, 'created_at', c.created_at,
                      'author', coalesce(pr.full_name, 'Equipe'), 'mine', c.owner_id = auth.uid())
                      order by c.created_at)
                    from task_comments c left join profiles pr on pr.id = c.owner_id
                    where c.task_id = t.id), '[]'::jsonb))
                 order by t.due_date nulls last, t.created_at)
               from tasks t
               where t.project_id = p.id
                 and (t.responsible_type = 'cliente' or t.visible_to_client)
                 and t.status <> 'cancelado'), '[]'::jsonb),
    'team', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(pm.name, pr.full_name, pm.email), 'role', pm.role))
               from project_members pm left join profiles pr on pr.id = pm.user_id
               where pm.project_id = p.id and pm.status = 'active' and pm.access_role <> 'cliente'), '[]'::jsonb)
  ) into r
  from projects p join organizations o on o.id = p.organization_id
  where p.id = _project;
  return r;
end $$;

-- avisa quem cuida do projeto
create or replace function public.notify_project_team(_project uuid, _title text, _body text, _link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, link)
  select distinct u, _title, _body, _link from (
    select pm.user_id u from project_members pm
     where pm.project_id = _project and pm.status = 'active'
       and pm.access_role in ('gestor','editor') and pm.user_id is not null
    union select p.owner_id from projects p where p.id = _project
    union select p.manager_id from projects p where p.id = _project
    union select p.responsible_id from projects p where p.id = _project
  ) x where u is not null and u <> auth.uid()
$$;

create or replace function public.portal_set_task_done(_task uuid, _done boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; who text;
begin
  select * into t from public.tasks where id = _task;
  if t.id is null or not public.is_project_client(t.project_id) or t.responsible_type <> 'cliente' then
    raise exception 'Você não pode alterar esta tarefa.' using errcode = '42501';
  end if;
  update public.tasks set status = case when _done then 'concluido' else 'a_fazer' end where id = _task;
  select coalesce(full_name, 'Cliente') into who from public.profiles where id = auth.uid();
  perform public.notify_project_team(t.project_id,
    case when _done then 'Cliente concluiu uma tarefa' else 'Cliente reabriu uma tarefa' end,
    coalesce(who, 'Cliente') || ': ' || t.title, '/projetos/' || t.project_id::text);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.portal_add_comment(_task uuid, _body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; who text;
begin
  if coalesce(trim(_body), '') = '' then raise exception 'Escreva um comentário.'; end if;
  select * into t from public.tasks where id = _task;
  if t.id is null or not public.is_project_client(t.project_id)
     or not (t.responsible_type = 'cliente' or t.visible_to_client) then
    raise exception 'Você não pode comentar nesta tarefa.' using errcode = '42501';
  end if;
  insert into public.task_comments (task_id, owner_id, body) values (_task, auth.uid(), left(_body, 4000));
  select coalesce(full_name, 'Cliente') into who from public.profiles where id = auth.uid();
  perform public.notify_project_team(t.project_id, 'Comentário do cliente',
    coalesce(who, 'Cliente') || ' em "' || t.title || '": ' || left(_body, 140), '/projetos/' || t.project_id::text);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.portal_my_projects() from public, anon;
revoke execute on function public.portal_project(uuid) from public, anon;
revoke execute on function public.portal_set_task_done(uuid, boolean) from public, anon;
revoke execute on function public.portal_add_comment(uuid, text) from public, anon;
revoke execute on function public.notify_project_team(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.refresh_project_stage(uuid) from public, anon, authenticated;
grant execute on function public.portal_my_projects() to authenticated;
grant execute on function public.portal_project(uuid) to authenticated;
grant execute on function public.portal_set_task_done(uuid, boolean) to authenticated;
grant execute on function public.portal_add_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- F) Fase 4 — departamentos e planilhas de custo (genérico)
-- ---------------------------------------------------------------------
create table if not exists public.cost_departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  template_id uuid references public.project_templates(id) on delete cascade,
  name text not null,
  color text not null default '#2563eb',
  position integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint cost_departments_scope_chk check ((project_id is null) <> (template_id is null))
);
create table if not exists public.cost_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.cost_departments(id) on delete cascade,
  name text not null,
  columns jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.cost_sheet_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sheet_id uuid not null references public.cost_sheets(id) on delete cascade,
  position integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cost_departments_project_idx on public.cost_departments (project_id);
create index if not exists cost_departments_template_idx on public.cost_departments (template_id);
create index if not exists cost_departments_org_idx on public.cost_departments (organization_id);
create index if not exists cost_sheets_dept_idx on public.cost_sheets (department_id);
create index if not exists cost_sheets_org_idx on public.cost_sheets (organization_id);
create index if not exists cost_sheet_rows_sheet_idx on public.cost_sheet_rows (sheet_id, position);
create index if not exists cost_sheet_rows_org_idx on public.cost_sheet_rows (organization_id);

create or replace function public.cost_dept_can(_dept uuid, _write boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cost_departments d
    where d.id = _dept and (
      case when d.project_id is not null then
        (case when _write then public.can_edit_project(d.project_id) else public.can_view_project(d.project_id) end)
        and exists (select 1 from public.projects p where p.id = d.project_id and p.organization_id = d.organization_id)
      else
        (case when _write then public.is_org_admin(d.organization_id) else public.is_org_member(d.organization_id) end)
        and exists (select 1 from public.project_templates pt where pt.id = d.template_id and pt.organization_id = d.organization_id)
      end)
  )
$$;

create or replace function public.cost_dept_scope_ok(_org uuid, _project uuid, _template uuid, _write boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when _project is not null then
      exists (select 1 from public.projects p where p.id = _project and p.organization_id = _org)
      and (case when _write then public.can_edit_project(_project) else public.can_view_project(_project) end)
    when _template is not null then
      exists (select 1 from public.project_templates t where t.id = _template and t.organization_id = _org)
      and (case when _write then public.is_org_admin(_org) else public.is_org_member(_org) end)
    else false end
$$;

alter table public.cost_departments enable row level security;
alter table public.cost_sheets enable row level security;
alter table public.cost_sheet_rows enable row level security;
grant select, insert, update, delete on public.cost_departments, public.cost_sheets, public.cost_sheet_rows to authenticated;
grant all on public.cost_departments, public.cost_sheets, public.cost_sheet_rows to service_role;

drop policy if exists "cost departments read" on public.cost_departments;
drop policy if exists "cost departments write" on public.cost_departments;
create policy "cost departments read" on public.cost_departments for select to authenticated
  using (public.cost_dept_scope_ok(organization_id, project_id, template_id, false));
create policy "cost departments write" on public.cost_departments for all to authenticated
  using (public.cost_dept_scope_ok(organization_id, project_id, template_id, true))
  with check (public.cost_dept_scope_ok(organization_id, project_id, template_id, true));

drop policy if exists "cost sheets read" on public.cost_sheets;
drop policy if exists "cost sheets write" on public.cost_sheets;
create policy "cost sheets read" on public.cost_sheets for select to authenticated
  using (public.cost_dept_can(department_id, false));
create policy "cost sheets write" on public.cost_sheets for all to authenticated
  using (public.cost_dept_can(department_id, true))
  with check (public.cost_dept_can(department_id, true)
    and organization_id = (select d.organization_id from public.cost_departments d where d.id = department_id));

drop policy if exists "cost rows read" on public.cost_sheet_rows;
drop policy if exists "cost rows write" on public.cost_sheet_rows;
create policy "cost rows read" on public.cost_sheet_rows for select to authenticated
  using (exists (select 1 from public.cost_sheets s where s.id = sheet_id and public.cost_dept_can(s.department_id, false)));
create policy "cost rows write" on public.cost_sheet_rows for all to authenticated
  using (exists (select 1 from public.cost_sheets s where s.id = sheet_id and public.cost_dept_can(s.department_id, true)))
  with check (exists (select 1 from public.cost_sheets s where s.id = sheet_id
    and s.organization_id = cost_sheet_rows.organization_id and public.cost_dept_can(s.department_id, true)));

revoke execute on function public.project_role(uuid), public.can_view_project(uuid), public.can_edit_project(uuid),
  public.can_manage_project(uuid), public.is_project_client(uuid), public.can_view_task(uuid), public.is_org_guest(uuid),
  public.cost_dept_can(uuid, boolean), public.cost_dept_scope_ok(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.project_role(uuid), public.can_view_project(uuid), public.can_edit_project(uuid),
  public.can_manage_project(uuid), public.is_project_client(uuid), public.can_view_task(uuid), public.is_org_guest(uuid),
  public.cost_dept_can(uuid, boolean), public.cost_dept_scope_ok(uuid, uuid, uuid, boolean) to authenticated, service_role;
