-- 17 — Anexos nas tarefas, mensagens do projeto e histórico da jornada (14/10/2026)
-- 1) Arquivos das tarefas (contrato assinado, locação, planilha de custos...):
--    guardados no bucket privado "task-attachments" e copiados para o Google Drive
--    da conta conectada da empresa. Nada é apagado de verdade: remover só marca
--    deleted_at, e tudo fica no histórico (quem, quando, hash SHA-256 do arquivo).
-- 2) Mensagens gerais do projeto (portal e Core).
-- 3) Histórico da jornada: uma função junta conclusões, comentários, arquivos,
--    mensagens e etapas concluídas. O cliente vê só o que é dele/visível.
-- Pode rodar mais de uma vez.

begin;

-- 1) Arquivos ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 20971520, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
  'text/csv'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.task_attachments
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists uploader_kind text not null default 'equipe',
  add column if not exists note text,
  add column if not exists sha256 text,
  add column if not exists drive_status text not null default 'pendente',
  add column if not exists drive_file_id text,
  add column if not exists drive_url text,
  add column if not exists drive_account text,
  add column if not exists drive_error text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

do $$ begin
  alter table public.task_attachments add constraint task_attachments_uploader_kind_chk
    check (uploader_kind in ('equipe','cliente'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.task_attachments add constraint task_attachments_drive_status_chk
    check (drive_status in ('pendente','ok','erro','sem_drive'));
exception when duplicate_object then null; end $$;

create index if not exists task_attachments_task_idx on public.task_attachments (task_id);
create index if not exists task_attachments_project_idx on public.task_attachments (project_id);

-- a equipe do projeto lê os arquivos; gravação só pelo servidor (com conferência de permissão)
drop policy if exists "project team reads attachments" on public.task_attachments;
create policy "project team reads attachments" on public.task_attachments for select to authenticated
  using (project_id is not null and public.can_view_project(project_id));

-- histórico dos arquivos: quem enviou/removeu (o servidor grava com a conta de serviço,
-- por isso o autor vem da própria linha); avisa a equipe quando o cliente envia
create or replace function public.tg_task_attachment_history()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_actor uuid; t record;
begin
  if tg_op = 'INSERT' then
    v_actor := coalesce(auth.uid(), new.uploaded_by);
    select id, title, project_id into t from public.tasks where id = new.task_id;
    if t.id is not null then
      insert into public.task_history(task_id, owner_id, actor_id, action, field, new_value)
      values (new.task_id, new.owner_id, v_actor, 'file_uploaded', 'attachment', new.name);
      if new.uploader_kind = 'cliente' and t.project_id is not null then
        perform public.notify_project_team(t.project_id, 'Cliente enviou um arquivo',
          coalesce((select full_name from public.profiles where id = v_actor), 'Cliente')
            || ' anexou "' || new.name || '" em "' || t.title || '"',
          '/projetos/' || t.project_id::text);
      end if;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is null
       and exists (select 1 from public.tasks where id = new.task_id) then
      insert into public.task_history(task_id, owner_id, actor_id, action, field, old_value)
      values (new.task_id, new.owner_id, coalesce(auth.uid(), new.deleted_by), 'file_deleted', 'attachment', new.name);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.tasks where id = old.task_id) then
      insert into public.task_history(task_id, owner_id, actor_id, action, field, old_value)
      values (old.task_id, old.owner_id, auth.uid(), 'file_deleted', 'attachment', old.name);
    end if;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists tg_task_attachment_history on public.task_attachments;
create trigger tg_task_attachment_history
  after insert or update of deleted_at or delete on public.task_attachments
  for each row execute function public.tg_task_attachment_history();

-- pastas do Drive já criadas (para não duplicar). Só o servidor usa.
create table if not exists public.drive_folders (
  key text primary key,
  folder_id text not null,
  drive_user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.drive_folders enable row level security;

-- 2) Mensagens do projeto --------------------------------------------------
create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  author_id uuid not null,
  author_kind text not null check (author_kind in ('equipe','cliente')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists project_messages_project_idx on public.project_messages (project_id, created_at);
alter table public.project_messages enable row level security;

drop policy if exists "project team reads messages" on public.project_messages;
create policy "project team reads messages" on public.project_messages for select to authenticated
  using (public.can_view_project(project_id));
drop policy if exists "project team writes messages" on public.project_messages;
create policy "project team writes messages" on public.project_messages for insert to authenticated
  with check (author_id = auth.uid() and author_kind = 'equipe' and public.can_view_project(project_id));

create or replace function public.tg_project_messages_fill()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  select organization_id into new.organization_id from public.projects where id = new.project_id;
  return new;
end $$;
drop trigger if exists tg_project_messages_fill on public.project_messages;
create trigger tg_project_messages_fill before insert on public.project_messages
  for each row execute function public.tg_project_messages_fill();

-- cliente escreve pelo portal
create or replace function public.portal_add_message(_project uuid, _body text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare who text;
begin
  if coalesce(trim(_body), '') = '' then raise exception 'Escreva uma mensagem.'; end if;
  if not public.is_project_client(_project) then
    raise exception 'Projeto não encontrado.' using errcode = '42501';
  end if;
  insert into public.project_messages (project_id, author_id, author_kind, body)
  values (_project, auth.uid(), 'cliente', left(trim(_body), 4000));
  select coalesce(full_name, 'Cliente') into who from public.profiles where id = auth.uid();
  perform public.notify_project_team(_project, 'Mensagem do cliente',
    coalesce(who, 'Cliente') || ': ' || left(_body, 140), '/projetos/' || _project::text);
  return jsonb_build_object('ok', true);
end $$;

-- 3) Etapas concluídas entram no histórico --------------------------------
create or replace function public.tg_project_stage_activity()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid;
begin
  if new.status is distinct from old.status and (new.status = 'done' or old.status = 'done') then
    select owner_id into v_owner from public.projects where id = new.project_id;
    insert into public.project_activity (owner_id, project_id, actor_id, action, entity, meta)
    values (coalesce(auth.uid(), v_owner), new.project_id, auth.uid(),
            case when new.status = 'done' then 'stage_done' else 'stage_reopened' end, 'stage',
            jsonb_build_object('stage_id', new.id, 'stage_name', new.name));
  end if;
  return new;
end $$;
drop trigger if exists tg_project_stage_activity on public.project_stages;
create trigger tg_project_stage_activity after update of status on public.project_stages
  for each row execute function public.tg_project_stage_activity();

-- Histórico da jornada (equipe vê tudo; cliente vê o que é dele ou visível)
create or replace function public.project_journey(_project uuid, _limit int default 300)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  team boolean := public.can_view_project(_project);
  client boolean := public.is_project_client(_project);
  r jsonb;
begin
  if not team and not client then
    raise exception 'Projeto não encontrado.' using errcode = '42501';
  end if;
  with clients as (
    select pm.user_id from public.project_members pm
    where pm.project_id = _project and pm.access_role = 'cliente' and pm.user_id is not null
  ), ev as (
    select h.created_at as at, h.actor_id, h.action as kind, t.id as task_id, t.title as task,
           s.name as stage,
           case when h.action = 'file_deleted' then h.old_value
                when h.action in ('status_changed','comment_added','file_uploaded','due_date_changed','task_edited') then h.new_value
           end as detail,
           case when h.action in ('status_changed','task_edited') then h.old_value end as old
    from public.task_history h
    join public.tasks t on t.id = h.task_id
    left join public.project_stages s on s.id = t.stage_id
    where t.project_id = _project
      and h.action in ('task_created','task_edited','status_changed','comment_added','file_uploaded',
                       'file_deleted','due_date_changed','assignee_changed')
      and (team or ((t.responsible_type = 'cliente' or t.visible_to_client)
                    and h.action in ('status_changed','comment_added','file_uploaded','file_deleted')))
    union all
    select m.created_at, m.author_id, 'message', null, null, null, m.body, null
    from public.project_messages m where m.project_id = _project
    union all
    select a.created_at, a.actor_id, a.action, null, null, a.meta->>'stage_name', null, null
    from public.project_activity a
    where a.project_id = _project and a.action in ('stage_done','stage_reopened')
  ), lim as (
    select * from ev order by at desc limit greatest(1, least(coalesce(_limit, 300), 1000))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', l.at, 'kind', l.kind, 'task_id', l.task_id, 'task', l.task, 'stage', l.stage,
      'detail', l.detail, 'old', l.old,
      'actor', case when l.actor_id is null then 'Sistema' else coalesce(pr.full_name, 'Usuário') end,
      'actor_kind', case when l.actor_id is null then 'sistema'
                         when l.actor_id in (select user_id from clients) then 'cliente'
                         else 'equipe' end,
      'mine', coalesce(l.actor_id = auth.uid(), false)) order by l.at desc), '[]'::jsonb)
  into r
  from lim l left join public.profiles pr on pr.id = l.actor_id;
  return r;
end $$;

-- 4) Portal: arquivos de cada tarefa + checagens usadas pelo servidor -------
create or replace function public.portal_project(_project uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
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
                    where c.task_id = t.id), '[]'::jsonb),
                 'attachments', coalesce((select jsonb_agg(jsonb_build_object(
                      'id', a.id, 'name', a.name, 'size', a.size, 'mime', a.mime,
                      'created_at', a.uploaded_at, 'note', a.note,
                      'author', coalesce(pa.full_name, case when a.uploader_kind = 'cliente' then 'Cliente' else 'Equipe' end),
                      'mine', a.uploaded_by = auth.uid())
                      order by a.uploaded_at)
                    from task_attachments a left join profiles pa on pa.id = a.uploaded_by
                    where a.task_id = t.id and a.deleted_at is null), '[]'::jsonb))
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

-- o cliente pode anexar nesta tarefa? (devolve o contexto para o servidor gravar)
create or replace function public.portal_attach_target(_task uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare t record;
begin
  select id, project_id, organization_id, responsible_type, visible_to_client, status
    into t from public.tasks where id = _task;
  if t.id is null or t.project_id is null or not public.is_project_client(t.project_id)
     or not (t.responsible_type = 'cliente' or t.visible_to_client) or t.status = 'cancelado' then
    raise exception 'Você não pode anexar arquivos nesta tarefa.' using errcode = '42501';
  end if;
  return jsonb_build_object('task_id', t.id, 'project_id', t.project_id,
                            'organization_id', t.organization_id, 'user_id', auth.uid());
end $$;

-- o cliente pode abrir/remover este arquivo?
create or replace function public.portal_attachment_target(_attachment uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare rec record;
begin
  select x.id, x.storage_path, x.name, x.uploaded_by, x.deleted_at, t.project_id,
         t.responsible_type, t.visible_to_client
    into rec
    from public.task_attachments x join public.tasks t on t.id = x.task_id
   where x.id = _attachment;
  if rec.id is null or rec.deleted_at is not null or not public.is_project_client(rec.project_id)
     or not (rec.responsible_type = 'cliente' or rec.visible_to_client) then
    raise exception 'Arquivo não encontrado.' using errcode = '42501';
  end if;
  return jsonb_build_object('id', rec.id, 'storage_path', rec.storage_path, 'name', rec.name,
                            'mine', rec.uploaded_by = auth.uid(), 'user_id', auth.uid());
end $$;

-- permissões das funções
revoke execute on function public.portal_add_message(uuid, text) from public, anon;
revoke execute on function public.project_journey(uuid, int) from public, anon;
revoke execute on function public.portal_attach_target(uuid) from public, anon;
revoke execute on function public.portal_attachment_target(uuid) from public, anon;
grant execute on function public.portal_add_message(uuid, text) to authenticated;
grant execute on function public.project_journey(uuid, int) to authenticated;
grant execute on function public.portal_attach_target(uuid) to authenticated;
grant execute on function public.portal_attachment_target(uuid) to authenticated;
revoke execute on function public.tg_task_attachment_history() from public, anon, authenticated;
revoke execute on function public.tg_project_messages_fill() from public, anon, authenticated;
revoke execute on function public.tg_project_stage_activity() from public, anon, authenticated;

commit;
