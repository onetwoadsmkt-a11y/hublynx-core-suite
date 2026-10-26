-- 23 — Mensagens nas tarefas do projeto: equipe (interna) e cliente (portal) (26/10/2026)
-- 1) Cada mensagem da tarefa tem destino: 'equipe' (só a equipe vê) ou 'cliente'
--    (aparece no portal do cliente). O cliente sempre escreve como 'cliente'.
--    Mensagens antigas de tarefas que o cliente já via continuam visíveis para ele.
-- 2) O portal só mostra mensagens 'cliente' (antes mostrava todos os comentários).
-- 3) Histórico do projeto: mensagens das tarefas entram com o destino; o cliente
--    só vê as dele/para ele.
-- 4) Histórico do lead: mensagens das tarefas e do projeto entram na jornada do
--    lead que originou o projeto (projects.lead_id, ou lead convertido no projeto/cliente).
-- 5) Mensagem da equipe para o cliente avisa os clientes do projeto.
-- Pode rodar mais de uma vez.

begin;

-- 1) Destino e autor da mensagem ------------------------------------------------
alter table public.task_comments
  add column if not exists visibility text not null default 'equipe',
  add column if not exists author_kind text not null default 'equipe';

do $$ begin
  alter table public.task_comments add constraint task_comments_visibility_chk
    check (visibility in ('equipe','cliente'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.task_comments add constraint task_comments_author_kind_chk
    check (author_kind in ('equipe','cliente'));
exception when duplicate_object then null; end $$;

-- Antes desta versão o portal mostrava todos os comentários das tarefas visíveis:
-- esses continuam visíveis ao cliente (nada some do portal dele).
update public.task_comments c
   set visibility = 'cliente'
  from public.tasks t
 where t.id = c.task_id and t.project_id is not null
   and (t.responsible_type = 'cliente' or t.visible_to_client)
   and c.visibility = 'equipe'
   and not exists (select 1 from public.app_config where key = 'migration_23_backfill');
-- comentários escritos por clientes do projeto
update public.task_comments c
   set author_kind = 'cliente', visibility = 'cliente'
  from public.tasks t
 where t.id = c.task_id and t.project_id is not null
   and exists (select 1 from public.project_members pm
                where pm.project_id = t.project_id and pm.user_id = c.owner_id and pm.access_role = 'cliente')
   and c.author_kind = 'equipe';
insert into public.app_config (key, value) values ('migration_23_backfill', '"ok"'::jsonb)
on conflict (key) do nothing;

create index if not exists task_comments_task_vis_idx on public.task_comments (task_id, visibility, created_at);

-- Equipe grava sempre como 'equipe'; 'cliente' só em tarefa de projeto.
drop policy if exists "team writes task comments" on public.task_comments;
create policy "team writes task comments" on public.task_comments for insert to authenticated
  with check (owner_id = auth.uid() and author_kind = 'equipe' and public.can_view_task(task_id));

create or replace function public.tg_task_comment_visibility()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.visibility = 'cliente'
     and not exists (select 1 from public.tasks where id = new.task_id and project_id is not null) then
    new.visibility := 'equipe';
  end if;
  return new;
end $$;
drop trigger if exists tg_task_comment_visibility on public.task_comments;
create trigger tg_task_comment_visibility before insert on public.task_comments
  for each row execute function public.tg_task_comment_visibility();

-- Cliente escreve pelo portal (sempre visível para ele)
create or replace function public.portal_add_comment(_task uuid, _body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; who text;
begin
  if coalesce(trim(_body), '') = '' then raise exception 'Escreva uma mensagem.'; end if;
  select * into t from public.tasks where id = _task;
  if t.id is null or not public.is_project_client(t.project_id)
     or not (t.responsible_type = 'cliente' or t.visible_to_client) then
    raise exception 'Você não pode comentar nesta tarefa.' using errcode = '42501';
  end if;
  insert into public.task_comments (task_id, owner_id, body, visibility, author_kind)
  values (_task, auth.uid(), left(_body, 4000), 'cliente', 'cliente');
  select coalesce(full_name, 'Cliente') into who from public.profiles where id = auth.uid();
  perform public.notify_project_team(t.project_id, 'Mensagem do cliente',
    coalesce(who, 'Cliente') || ' em "' || t.title || '": ' || left(_body, 140), '/projetos/' || t.project_id::text);
  return jsonb_build_object('ok', true);
end $$;

-- texto simples de uma mensagem (as da equipe podem vir em HTML do editor)
create or replace function public.plain_text(_html text)
returns text language sql immutable set search_path to 'public' as $$
  select trim(regexp_replace(
           replace(replace(replace(replace(
             regexp_replace(regexp_replace(coalesce(_html, ''), '<(br|/p|/li|/div)[^>]*>', E'\n', 'gi'), '<[^>]+>', '', 'g'),
             '&nbsp;', ' '), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'),
           E'\n{3,}', E'\n\n', 'g'))
$$;

-- 4) Jornada do lead -----------------------------------------------------------
-- Leads ligados ao projeto: o de origem e os convertidos nele ou no cliente dele.
create or replace function public.project_lead_ids(_project uuid)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct l.id from public.leads l
  join public.projects p on p.id = _project
  where l.id = p.lead_id
     or l.converted_project_id = p.id
     or (p.client_id is not null and l.converted_client_id = p.client_id)
$$;

create or replace function public.tg_task_comment_lead_journey()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t record; who text; lid uuid; l record; txt text;
begin
  select id, title, project_id into t from public.tasks where id = new.task_id;
  if t.project_id is null then return new; end if;
  select coalesce(full_name, case when new.author_kind = 'cliente' then 'Cliente' else 'Equipe' end)
    into who from public.profiles where id = new.owner_id;
  txt := left(public.plain_text(new.body), 500);
  for lid in select public.project_lead_ids(t.project_id) loop
    select id, owner_id, organization_id into l from public.leads where id = lid;
    insert into public.lead_events (lead_id, owner_id, organization_id, actor_id, kind, title, description, meta)
    values (l.id, l.owner_id, l.organization_id, new.owner_id, 'project_message',
      case when new.author_kind = 'cliente' then 'Cliente escreveu na tarefa “' || t.title || '”'
           when new.visibility = 'cliente' then 'Mensagem ao cliente na tarefa “' || t.title || '”'
           else 'Mensagem interna na tarefa “' || t.title || '”' end,
      coalesce(who, 'Equipe') || ': ' || txt,
      jsonb_build_object('project_id', t.project_id, 'task_id', t.id, 'comment_id', new.id,
                         'visibility', new.visibility, 'author_kind', new.author_kind));
  end loop;
  return new;
end $$;
drop trigger if exists tg_task_comment_lead_journey on public.task_comments;
create trigger tg_task_comment_lead_journey after insert on public.task_comments
  for each row execute function public.tg_task_comment_lead_journey();

create or replace function public.tg_project_message_lead_journey()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare lid uuid; l record; who text; pname text;
begin
  select name into pname from public.projects where id = new.project_id;
  select coalesce(full_name, case when new.author_kind = 'cliente' then 'Cliente' else 'Equipe' end)
    into who from public.profiles where id = new.author_id;
  for lid in select public.project_lead_ids(new.project_id) loop
    select id, owner_id, organization_id into l from public.leads where id = lid;
    insert into public.lead_events (lead_id, owner_id, organization_id, actor_id, kind, title, description, meta)
    values (l.id, l.owner_id, l.organization_id, new.author_id, 'project_message',
      case when new.author_kind = 'cliente' then 'Cliente enviou mensagem no projeto “' || coalesce(pname, '') || '”'
           else 'Mensagem no projeto “' || coalesce(pname, '') || '”' end,
      coalesce(who, 'Equipe') || ': ' || left(new.body, 500),
      jsonb_build_object('project_id', new.project_id, 'message_id', new.id,
                         'visibility', 'cliente', 'author_kind', new.author_kind));
  end loop;
  return new;
end $$;
drop trigger if exists tg_project_message_lead_journey on public.project_messages;
create trigger tg_project_message_lead_journey after insert on public.project_messages
  for each row execute function public.tg_project_message_lead_journey();

-- 5) Equipe escreveu para o cliente: avisa os clientes do projeto ------------------
create or replace function public.tg_task_comment_notify_client()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t record; uid uuid;
begin
  if new.visibility <> 'cliente' or new.author_kind <> 'equipe' then return new; end if;
  select id, title, project_id into t from public.tasks where id = new.task_id;
  if t.project_id is null then return new; end if;
  for uid in select pm.user_id from public.project_members pm
              where pm.project_id = t.project_id and pm.access_role = 'cliente'
                and pm.user_id is not null and pm.status = 'active' loop
    insert into public.notifications (user_id, title, body, link)
    values (uid, 'Nova mensagem da equipe', 'Em "' || t.title || '": ' || left(public.plain_text(new.body), 140),
            '/portal/' || t.project_id::text);
  end loop;
  return new;
end $$;
drop trigger if exists tg_task_comment_notify_client on public.task_comments;
create trigger tg_task_comment_notify_client after insert on public.task_comments
  for each row execute function public.tg_task_comment_notify_client();

-- 2) Portal: só mensagens para o cliente -------------------------------------------
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
                 'start_date', s.start_date, 'due_date', s.due_date,
                 'phase', s.phase, 'week_label', s.week_label, 'alert', s.alert) order by s.sort_order)
               from project_stages s where s.project_id = p.id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', t.id, 'stage_id', t.stage_id, 'title', t.title, 'description', t.description,
                 'status', t.status, 'due_date', t.due_date, 'completed_at', t.completed_at,
                 'responsible_type', t.responsible_type,
                 'comments', coalesce((select jsonb_agg(jsonb_build_object(
                      'id', c.id, 'body', c.body, 'created_at', c.created_at,
                      'author', coalesce(pr.full_name, case when c.author_kind = 'cliente' then 'Cliente' else 'Equipe' end),
                      'author_kind', c.author_kind,
                      'mine', c.owner_id = auth.uid())
                      order by c.created_at)
                    from task_comments c left join profiles pr on pr.id = c.owner_id
                    where c.task_id = t.id and c.visibility = 'cliente'), '[]'::jsonb),
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

-- 3) Histórico do projeto com o destino de cada mensagem ---------------------------
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
                when h.action in ('status_changed','file_uploaded','due_date_changed','task_edited') then h.new_value
           end as detail,
           case when h.action in ('status_changed','task_edited') then h.old_value end as old,
           null::text as visibility
    from public.task_history h
    join public.tasks t on t.id = h.task_id
    left join public.project_stages s on s.id = t.stage_id
    where t.project_id = _project
      and h.action in ('task_created','task_edited','status_changed','file_uploaded',
                       'file_deleted','due_date_changed','assignee_changed')
      and (team or ((t.responsible_type = 'cliente' or t.visible_to_client)
                    and h.action in ('status_changed','file_uploaded','file_deleted')))
    union all
    -- mensagens das tarefas (com destino); o cliente só vê as do portal
    select c.created_at, c.owner_id, 'comment_added', t.id, t.title, s.name,
           left(public.plain_text(c.body), 600), null, c.visibility
    from public.task_comments c
    join public.tasks t on t.id = c.task_id
    left join public.project_stages s on s.id = t.stage_id
    where t.project_id = _project
      and (team or (c.visibility = 'cliente' and (t.responsible_type = 'cliente' or t.visible_to_client)))
    union all
    select m.created_at, m.author_id, 'message', null, null, null, m.body, null, 'cliente'
    from public.project_messages m where m.project_id = _project
    union all
    select a.created_at, a.actor_id, a.action, null, null, a.meta->>'stage_name', null, null, null
    from public.project_activity a
    where a.project_id = _project and a.action in ('stage_done','stage_reopened')
  ), lim as (
    select * from ev order by at desc limit greatest(1, least(coalesce(_limit, 300), 1000))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', l.at, 'kind', l.kind, 'task_id', l.task_id, 'task', l.task, 'stage', l.stage,
      'detail', l.detail, 'old', l.old, 'visibility', l.visibility,
      'actor', case when l.actor_id is null then 'Sistema' else coalesce(pr.full_name, 'Usuário') end,
      'actor_kind', case when l.actor_id is null then 'sistema'
                         when l.actor_id in (select user_id from clients) then 'cliente'
                         else 'equipe' end,
      'mine', coalesce(l.actor_id = auth.uid(), false)) order by l.at desc), '[]'::jsonb)
  into r
  from lim l left join public.profiles pr on pr.id = l.actor_id;
  return r;
end $$;

-- permissões
revoke execute on function public.project_lead_ids(uuid) from public, anon, authenticated;
revoke execute on function public.tg_task_comment_lead_journey() from public, anon, authenticated;
revoke execute on function public.tg_project_message_lead_journey() from public, anon, authenticated;
revoke execute on function public.tg_task_comment_notify_client() from public, anon, authenticated;
revoke execute on function public.portal_add_comment(uuid, text) from public, anon;
grant execute on function public.portal_add_comment(uuid, text) to authenticated;
revoke execute on function public.project_journey(uuid, int) from public, anon;
grant execute on function public.project_journey(uuid, int) to authenticated;

commit;
