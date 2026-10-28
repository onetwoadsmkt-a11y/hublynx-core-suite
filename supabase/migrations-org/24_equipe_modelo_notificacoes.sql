-- 24 — Equipe no modelo de projeto e notificações de tarefas designadas (28/10/2026)
-- 1) Modelo de projeto guarda a equipe (pessoa + departamento + papel) e o responsável
--    de cada tarefa padrão. Ao aplicar o modelo, a equipe entra no projeto e cada
--    tarefa já nasce com o seu responsável.
-- 2) Avisos de tarefa levam direto à tarefa: no projeto (aba Etapas, tarefa em
--    destaque) ou na Agenda, para tarefas fora de projeto.
-- 3) Quem recebe uma tarefa (ao criar ou ao trocar o responsável) é avisado no sino.
-- Só acrescenta itens: nada é apagado. Pode rodar mais de uma vez.

begin;

-- 1) Equipe do modelo ---------------------------------------------------------------
create table if not exists public.project_template_members (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.project_templates(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  email text,
  department text,
  access_role text not null default 'executor',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (template_id, user_id)
);
do $$ begin
  alter table public.project_template_members add constraint project_template_members_role_chk
    check (access_role in ('gestor','editor','executor','visualizador'));
exception when duplicate_object then null; end $$;
create index if not exists project_template_members_tpl_idx on public.project_template_members (template_id, sort_order);
create index if not exists project_template_members_org_idx on public.project_template_members (organization_id);

grant select, insert, update, delete on public.project_template_members to authenticated;
grant all on public.project_template_members to service_role;
alter table public.project_template_members enable row level security;

drop policy if exists "template members read" on public.project_template_members;
create policy "template members read" on public.project_template_members for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists "template members write" on public.project_template_members;
create policy "template members write" on public.project_template_members for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id)
              and exists (select 1 from public.project_templates t
                           where t.id = template_id and t.organization_id = organization_id));

-- responsável de cada tarefa padrão (pessoa da equipe do modelo)
alter table public.project_template_tasks
  add column if not exists assignee_user_id uuid references auth.users(id) on delete set null;

-- 2) Endereço da tarefa (usado nos avisos) -------------------------------------------
create or replace function public.task_link(_task uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
           when t.project_id is not null
             then '/projetos/' || t.project_id::text || '?aba=etapas&tarefa=' || t.id::text
           else '/tarefas?task=' || t.id::text
         end
  from public.tasks t where t.id = _task
$$;
revoke execute on function public.task_link(uuid) from public, anon;
grant execute on function public.task_link(uuid) to authenticated;

-- 3) Histórico e avisos das tarefas (mesma regra de antes, com o link certo) ---------
create or replace function public.tg_tasks_history()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_project text;
begin
  if tg_op = 'INSERT' then
    insert into public.task_history(task_id, owner_id, actor_id, action)
    values (new.id, new.owner_id, v_actor, 'task_created');
    -- tarefa criada já com responsável: avisa quem vai executar
    if new.assignee_id is not null
       and new.assignee_id <> coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) then
      select name into v_project from public.projects where id = new.project_id;
      insert into public.notifications(user_id, title, body, link)
      values (new.assignee_id, 'Nova tarefa para você',
              new.title || coalesce(' · ' || v_project, ''), public.task_link(new.id));
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.title is distinct from old.title then
      insert into public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      values (new.id, new.owner_id, v_actor, 'task_edited', 'title', old.title, new.title);
    end if;
    if new.status is distinct from old.status then
      insert into public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      values (new.id, new.owner_id, v_actor, 'status_changed', 'status', old.status::text, new.status::text);
      if new.status = 'concluido' and old.status <> 'concluido'
         and new.created_by is not null and new.created_by <> coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) then
        insert into public.notifications(user_id, title, body, link)
        values (new.created_by, 'Tarefa concluída', 'A tarefa "' || new.title || '" foi concluída.', public.task_link(new.id));
      end if;
    end if;
    if new.priority is distinct from old.priority then
      insert into public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      values (new.id, new.owner_id, v_actor, 'priority_changed', 'priority', old.priority::text, new.priority::text);
    end if;
    if new.assignee_id is distinct from old.assignee_id then
      insert into public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      values (new.id, new.owner_id, v_actor, 'assignee_changed', 'assignee_id', old.assignee_id::text, new.assignee_id::text);
      if new.assignee_id is not null
         and new.assignee_id <> coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) then
        select name into v_project from public.projects where id = new.project_id;
        insert into public.notifications(user_id, title, body, link)
        values (new.assignee_id, 'Nova tarefa para você',
                new.title || coalesce(' · ' || v_project, ''), public.task_link(new.id));
      end if;
    end if;
    if new.project_id is distinct from old.project_id then
      insert into public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      values (new.id, new.owner_id, v_actor, 'project_changed', 'project_id', old.project_id::text, new.project_id::text);
    end if;
    if new.client_id is distinct from old.client_id then
      insert into public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      values (new.id, new.owner_id, v_actor, 'client_changed', 'client_id', old.client_id::text, new.client_id::text);
    end if;
    if new.due_date is distinct from old.due_date then
      insert into public.task_history(task_id, owner_id, actor_id, action, field, old_value, new_value)
      values (new.id, new.owner_id, v_actor, 'due_date_changed', 'due_date', old.due_date::text, new.due_date::text);
    end if;
    return new;
  end if;
  return null;
end $$;
revoke execute on function public.tg_tasks_history() from public, anon, authenticated;

-- avisos antigos de tarefa passam a abrir a tarefa no lugar certo
update public.notifications n
   set link = public.task_link(substring(n.link from 'task=([0-9a-f-]{36})')::uuid)
 where n.link like '/tarefas?task=%'
   and exists (select 1 from public.tasks t
                where t.id = substring(n.link from 'task=([0-9a-f-]{36})')::uuid
                  and t.project_id is not null);

-- índice para os avisos e e-mails de tarefas designadas
create index if not exists tasks_assignee_open_idx on public.tasks (assignee_id, due_date)
  where status not in ('concluido','cancelado');

commit;
