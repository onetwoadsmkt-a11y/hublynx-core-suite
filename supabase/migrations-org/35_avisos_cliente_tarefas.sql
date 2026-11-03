-- 35 — Portal do cliente: aviso no sino (com som) e por e-mail das tarefas agendadas para o cliente (03/11/2026)
-- Tarefa do cliente criada (ou passada para o cliente) → "Nova tarefa para você" para os clientes do projeto.
-- Prazo de tarefa do cliente alterado → "Prazo da sua tarefa alterado". O link abre o portal do projeto.
-- Todo aviso do cliente leva direto à tarefa no portal (/portal/<projeto>?tarefa=<id>).
-- Pode rodar mais de uma vez.

-- tempo real do sino (Core e portal): avisos novos chegam na hora
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;

create or replace function public.tg_tasks_zzz_client_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid;
  org uuid;
  slug text;
  v_proj text;
  v_title text;
  v_body text;
  v_link text;
  v_actor uuid := auth.uid();
begin
  if new.project_id is null or new.responsible_type is distinct from 'cliente'
     or new.status in ('concluido', 'cancelado') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.responsible_type is distinct from 'cliente' then
      v_title := 'Nova tarefa para você';
    elsif new.due_date is distinct from old.due_date then
      v_title := 'Prazo da sua tarefa alterado';
    else
      return new;
    end if;
  else
    v_title := 'Nova tarefa para você';
  end if;

  select name, organization_id, coalesce(portal_slug, id::text) into v_proj, org, slug
    from public.projects where id = new.project_id;
  v_body := new.title || ' · prazo ' ||
    coalesce(to_char(new.due_date at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), 'a definir') ||
    ' · ' || coalesce(v_proj, 'Projeto');
  v_link := '/portal/' || slug || '?tarefa=' || new.id::text;

  for uid in select * from public.project_clients(new.project_id) loop
    continue when uid = coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid);
    -- o aviso "Nova tarefa para você" do responsável (link do Core) passa a abrir o portal
    update public.notifications set link = v_link
     where user_id = uid and title = 'Nova tarefa para você' and link not like '/portal/%'
       and link like '%' || new.id::text || '%'
       and created_at > now() - interval '1 minute';
    if not exists (
      select 1 from public.notifications n
       where n.user_id = uid and n.title = v_title
         and n.link like '/portal/' || slug || '%'
         and (n.link = v_link or v_title <> 'Nova tarefa para você')
         and (n.body like new.title || '%' or v_title <> 'Nova tarefa para você')
         and n.created_at > now() - interval '2 minutes'
    ) then
      insert into public.notifications (user_id, title, body, link)
      values (uid, v_title, left(v_body, 280), v_link);
    end if;
    insert into public.project_mail_queue
      (organization_id, project_id, user_id, audience, kind, is_message, title, body, link, actor_id)
    values (org, new.project_id, uid, 'cliente', 'task_client', false, v_title, left(v_body, 1000), v_link, v_actor);
  end loop;
  return new;
exception when others then
  return new; -- o aviso nunca impede salvar a tarefa
end $$;
revoke execute on function public.tg_tasks_zzz_client_notify() from public, anon, authenticated;

drop trigger if exists tg_tasks_zzz_client_notify on public.tasks;
create trigger tg_tasks_zzz_client_notify after insert or update of responsible_type, due_date on public.tasks
  for each row execute function public.tg_tasks_zzz_client_notify();

select tgname from pg_trigger where tgname = 'tg_tasks_zzz_client_notify';

-- Avisos do projeto para o cliente (mensagens, etc.): link do portal já na tarefa
create or replace function public.project_notify(
  _project uuid, _task uuid, _audience text, _kind text, _is_message boolean,
  _title text, _body text, _link text, _actor uuid, _bell boolean default true
) returns void language plpgsql security definer set search_path to 'public' as $$
declare uid uuid; org uuid; slug text; v_link text;
begin
  if _project is null then return; end if;
  select organization_id, coalesce(portal_slug, id::text) into org, slug from public.projects where id = _project;
  v_link := case when _audience = 'cliente'
                 then '/portal/' || slug || coalesce('?tarefa=' || _task::text, '')
                 else _link end;
  for uid in
    select * from public.project_watchers(_project, _task) where _audience = 'equipe'
    union
    select * from public.project_clients(_project) where _audience = 'cliente'
  loop
    continue when uid = coalesce(_actor, '00000000-0000-0000-0000-000000000000'::uuid);
    continue when _audience = 'equipe' and public.is_client_of(_project, uid);
    if _bell and not exists (
      select 1 from public.notifications n
       where n.user_id = uid and n.link is not distinct from v_link and n.title = _title
         and n.created_at > now() - interval '2 minutes'
    ) then
      insert into public.notifications (user_id, title, body, link)
      values (uid, _title, left(coalesce(_body, ''), 280), v_link);
    end if;
    insert into public.project_mail_queue
      (organization_id, project_id, user_id, audience, kind, is_message, title, body, link, actor_id)
    values (org, _project, uid, _audience, _kind, _is_message, _title, left(coalesce(_body, ''), 1000),
            v_link, _actor);
  end loop;
end $$;
revoke execute on function public.project_notify(uuid, uuid, text, text, boolean, text, text, text, uuid, boolean)
  from public, anon, authenticated;

-- Equipe escreveu para o cliente na tarefa: o sino do cliente abre a tarefa no portal
create or replace function public.tg_task_comment_notify_client()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t record; uid uuid; slug text;
begin
  if new.visibility <> 'cliente' or new.author_kind <> 'equipe' then return new; end if;
  select id, title, project_id into t from public.tasks where id = new.task_id;
  if t.project_id is null then return new; end if;
  select coalesce(portal_slug, id::text) into slug from public.projects where id = t.project_id;
  for uid in select pm.user_id from public.project_members pm
              where pm.project_id = t.project_id and pm.access_role = 'cliente'
                and pm.user_id is not null and pm.status = 'active' loop
    insert into public.notifications (user_id, title, body, link)
    values (uid, 'Nova mensagem da equipe', 'Em "' || t.title || '": ' || left(public.plain_text(new.body), 140),
            '/portal/' || slug || '?tarefa=' || t.id::text);
  end loop;
  return new;
end $$;
