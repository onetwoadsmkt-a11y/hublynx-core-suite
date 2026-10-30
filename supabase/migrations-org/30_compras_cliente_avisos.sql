-- 30 — Compras visível ao cliente e avisos de movimentação do projeto (30/10/2026)
--
-- 1) projects.portal_show_purchases: libera a aba Compras (só leitura) no portal do cliente.
--    Desligado por padrão: nada muda até a equipe ligar no Comercial do projeto.
-- 2) Avisos de movimentação e de mensagens:
--    • sino do Core na hora (sem repetir o mesmo aviso para a mesma pessoa em 2 minutos);
--    • e-mail agrupado: cada aviso entra na fila project_mail_queue e o Core manda um
--      resumo por pessoa (mensagens em ~5 min, demais movimentações em ~15 min).
--    Quem recebe: o responsável pela tarefa, quem criou a tarefa e quem cuida do projeto
--    (dono, gestor, responsável e membros gestor/editor). Quem fez a ação não recebe.
--    Mensagens da equipe para o cliente e do cliente para a equipe também vão por e-mail.
-- Pode rodar mais de uma vez.

-- 1) Compras no portal ----------------------------------------------------------------
alter table public.projects add column if not exists portal_show_purchases boolean not null default false;

-- 2) Fila de e-mails -----------------------------------------------------------------
create table if not exists public.project_mail_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid not null,
  audience text not null default 'equipe' check (audience in ('equipe','cliente')),
  kind text not null,
  is_message boolean not null default false,
  title text not null,
  body text,
  link text,
  actor_id uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0
);
create index if not exists project_mail_queue_pending_idx
  on public.project_mail_queue (user_id, created_at) where sent_at is null;
alter table public.project_mail_queue enable row level security;
-- sem políticas: só o servidor (chave de serviço) lê e grava a fila
revoke all on public.project_mail_queue from anon, authenticated;

-- quem cuida do projeto + quem está na tarefa
create or replace function public.project_watchers(_project uuid, _task uuid default null)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct u from (
    select pm.user_id u from public.project_members pm
     where pm.project_id = _project and pm.status = 'active'
       and pm.access_role in ('gestor','editor') and pm.user_id is not null
    union all select p.owner_id from public.projects p where p.id = _project
    union all select p.manager_id from public.projects p where p.id = _project
    union all select p.responsible_id from public.projects p where p.id = _project
    union all select t.assignee_id from public.tasks t where t.id = _task
    union all select t.created_by from public.tasks t where t.id = _task
  ) x where u is not null
$$;
revoke execute on function public.project_watchers(uuid, uuid) from public, anon, authenticated;

create or replace function public.project_clients(_project uuid)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct pm.user_id from public.project_members pm
   where pm.project_id = _project and pm.access_role = 'cliente'
     and pm.status = 'active' and pm.user_id is not null
$$;
revoke execute on function public.project_clients(uuid) from public, anon, authenticated;

/**
 * Registra um aviso: sino (opcional) + fila de e-mail.
 * _audience: 'equipe' (quem cuida do projeto/tarefa) ou 'cliente' (clientes do projeto).
 */
create or replace function public.project_notify(
  _project uuid, _task uuid, _audience text, _kind text, _is_message boolean,
  _title text, _body text, _link text, _actor uuid, _bell boolean default true
) returns void language plpgsql security definer set search_path to 'public' as $$
declare uid uuid; org uuid; slug text; v_link text;
begin
  if _project is null then return; end if;
  select organization_id, coalesce(portal_slug, id::text) into org, slug from public.projects where id = _project;
  v_link := case when _audience = 'cliente' then '/portal/' || slug else _link end;
  for uid in
    select * from public.project_watchers(_project, _task) where _audience = 'equipe'
    union
    select * from public.project_clients(_project) where _audience = 'cliente'
  loop
    continue when uid = coalesce(_actor, '00000000-0000-0000-0000-000000000000'::uuid);
    -- cliente só recebe avisos do lado do cliente
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

create or replace function public.is_client_of(_project uuid, _user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.project_members pm
                  where pm.project_id = _project and pm.user_id = _user
                    and pm.access_role = 'cliente' and pm.status = 'active')
$$;
revoke execute on function public.is_client_of(uuid, uuid) from public, anon, authenticated;

create or replace function public.actor_name(_user uuid, _fallback text default 'Equipe')
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce((select nullif(trim(full_name), '') from public.profiles where id = _user), _fallback)
$$;
revoke execute on function public.actor_name(uuid, text) from public, anon, authenticated;

-- 3) Tarefas: concluída, reaberta, excluída, prazo alterado, nova tarefa ---------------
create or replace function public.tg_tasks_zz_activity()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_who text;
  v_proj text;
  v_link text;
  v_client boolean;
begin
  if new.project_id is null then return new; end if;
  v_who := public.actor_name(v_actor);
  select name into v_proj from public.projects where id = new.project_id;
  v_link := public.task_link(new.id);
  v_client := v_actor is not null and public.is_client_of(new.project_id, v_actor);
  if v_client then v_who := public.actor_name(v_actor, 'Cliente'); end if;

  if tg_op = 'INSERT' then
    -- o responsável já recebe "Nova tarefa para você" no sino; aqui vai só para o e-mail
    perform public.project_notify(new.project_id, new.id, 'equipe', 'task_created', false,
      'Nova tarefa no projeto', v_proj || ' · ' || new.title || ' (por ' || v_who || ')', v_link, v_actor, false);
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'concluido' then
      -- conclusão pelo portal já avisa a equipe no sino ("Cliente concluiu uma tarefa")
      perform public.project_notify(new.project_id, new.id, 'equipe', 'task_done', false,
        'Tarefa concluída', v_proj || ' · ' || new.title || ' — concluída por ' || v_who, v_link, v_actor, not v_client);
    elsif new.status = 'cancelado' then
      perform public.project_notify(new.project_id, new.id, 'equipe', 'task_deleted', false,
        'Tarefa excluída', v_proj || ' · ' || new.title || ' — excluída por ' || v_who, v_link, v_actor);
    elsif old.status = 'concluido' then
      perform public.project_notify(new.project_id, new.id, 'equipe', 'task_reopened', false,
        'Tarefa reaberta', v_proj || ' · ' || new.title || ' — reaberta por ' || v_who, v_link, v_actor, not v_client);
    elsif new.status = 'em_andamento' then
      perform public.project_notify(new.project_id, new.id, 'equipe', 'task_started', false,
        'Tarefa em andamento', v_proj || ' · ' || new.title || ' — iniciada por ' || v_who, v_link, v_actor, false);
    end if;
  end if;

  if new.due_date is distinct from old.due_date and new.status <> 'cancelado' then
    perform public.project_notify(new.project_id, new.id, 'equipe', 'task_due_changed', false,
      'Prazo alterado', v_proj || ' · ' || new.title || ' — novo prazo ' ||
        coalesce(to_char(new.due_date at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), 'sem prazo') ||
        ' (por ' || v_who || ')',
      -- link do projeto: reprogramar o cronograma vira um aviso só no sino
      '/projetos/' || new.project_id::text || '?aba=etapas', v_actor);
  end if;
  return new;
end $$;
revoke execute on function public.tg_tasks_zz_activity() from public, anon, authenticated;
drop trigger if exists tg_tasks_zz_activity on public.tasks;
create trigger tg_tasks_zz_activity after insert or update of status, due_date on public.tasks
  for each row execute function public.tg_tasks_zz_activity();

-- 4) Etapa concluída / reaberta -----------------------------------------------------------
create or replace function public.tg_project_stage_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_actor uuid := auth.uid(); v_proj text;
begin
  if new.status is not distinct from old.status or not (new.status = 'done' or old.status = 'done') then
    return new;
  end if;
  select name into v_proj from public.projects where id = new.project_id;
  perform public.project_notify(new.project_id, null, 'equipe',
    case when new.status = 'done' then 'stage_done' else 'stage_reopened' end, false,
    case when new.status = 'done' then 'Etapa concluída' else 'Etapa reaberta' end,
    v_proj || ' · ' || new.name || ' (por ' || public.actor_name(v_actor) || ')',
    '/projetos/' || new.project_id::text || '?aba=etapas', v_actor);
  return new;
end $$;
revoke execute on function public.tg_project_stage_notify() from public, anon, authenticated;
drop trigger if exists tg_project_stage_notify on public.project_stages;
create trigger tg_project_stage_notify after update of status on public.project_stages
  for each row execute function public.tg_project_stage_notify();

-- 5) Arquivo anexado numa tarefa -------------------------------------------------------
create or replace function public.tg_task_attachment_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t record; v_proj text; v_who text;
begin
  select id, title, project_id into t from public.tasks where id = new.task_id;
  if t.project_id is null then return new; end if;
  select name into v_proj from public.projects where id = t.project_id;
  v_who := public.actor_name(new.uploaded_by, case when new.uploader_kind = 'cliente' then 'Cliente' else 'Equipe' end);
  perform public.project_notify(t.project_id, t.id, 'equipe', 'attachment', false,
    case when new.uploader_kind = 'cliente' then 'Cliente anexou um arquivo' else 'Arquivo anexado' end,
    v_proj || ' · ' || t.title || ' — ' || new.name || ' (por ' || v_who || ')',
    public.task_link(t.id), new.uploaded_by);
  return new;
end $$;
revoke execute on function public.tg_task_attachment_notify() from public, anon, authenticated;
drop trigger if exists tg_task_attachment_notify on public.task_attachments;
create trigger tg_task_attachment_notify after insert on public.task_attachments
  for each row execute function public.tg_task_attachment_notify();

-- 6) Mensagens nas tarefas (equipe e cliente) -----------------------------------------
create or replace function public.tg_task_comment_notify_team()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t record; v_proj text; v_who text; v_txt text;
begin
  select id, title, project_id into t from public.tasks where id = new.task_id;
  if t.project_id is null then return new; end if;
  select name into v_proj from public.projects where id = t.project_id;
  v_who := public.actor_name(new.owner_id, case when new.author_kind = 'cliente' then 'Cliente' else 'Equipe' end);
  v_txt := left(public.plain_text(new.body), 400);
  -- equipe: sino + e-mail para quem está na tarefa e cuida do projeto
  perform public.project_notify(t.project_id, t.id, 'equipe', 'message', true,
    case when new.author_kind = 'cliente' then 'Mensagem do cliente' else 'Nova mensagem na tarefa' end,
    v_proj || ' · ' || t.title || ' — ' || v_who || ': ' || v_txt,
    public.task_link(t.id), new.owner_id);
  -- equipe escreveu para o cliente: o sino do cliente já é avisado; aqui vai o e-mail
  if new.visibility = 'cliente' and new.author_kind = 'equipe' then
    perform public.project_notify(t.project_id, t.id, 'cliente', 'message', true,
      'Nova mensagem da equipe', t.title || ' — ' || v_who || ': ' || v_txt, null, new.owner_id, false);
  end if;
  return new;
end $$;
revoke execute on function public.tg_task_comment_notify_team() from public, anon, authenticated;
drop trigger if exists tg_task_comment_notify_team on public.task_comments;
create trigger tg_task_comment_notify_team after insert on public.task_comments
  for each row execute function public.tg_task_comment_notify_team();

-- 7) Mensagens gerais do projeto (Histórico e mensagens) ---------------------------------
create or replace function public.tg_project_message_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_proj text; v_who text; v_txt text;
begin
  select name into v_proj from public.projects where id = new.project_id;
  v_who := public.actor_name(new.author_id, case when new.author_kind = 'cliente' then 'Cliente' else 'Equipe' end);
  v_txt := left(public.plain_text(new.body), 400);
  perform public.project_notify(new.project_id, null, 'equipe', 'message', true,
    case when new.author_kind = 'cliente' then 'Mensagem do cliente' else 'Nova mensagem no projeto' end,
    v_proj || ' — ' || v_who || ': ' || v_txt,
    '/projetos/' || new.project_id::text || '?aba=historico', new.author_id);
  if new.author_kind = 'equipe' then
    perform public.project_notify(new.project_id, null, 'cliente', 'message', true,
      'Nova mensagem da equipe', v_proj || ' — ' || v_who || ': ' || v_txt, null, new.author_id);
  end if;
  return new;
end $$;
revoke execute on function public.tg_project_message_notify() from public, anon, authenticated;
drop trigger if exists tg_project_message_notify on public.project_messages;
create trigger tg_project_message_notify after insert on public.project_messages
  for each row execute function public.tg_project_message_notify();
