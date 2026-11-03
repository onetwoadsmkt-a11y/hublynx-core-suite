-- 33 — Mensagem interna da tarefa direcionada a uma pessoa da equipe (03/11/2026)
-- Roadmap › tarefa › destino "Equipe ▾" › escolher a pessoa. Ela recebe no sino e por e-mail;
-- a mensagem continua visível para a equipe na tarefa (nunca para o cliente). Pode rodar mais de uma vez.
alter table public.task_comments
  add column if not exists recipient_id uuid references auth.users(id) on delete set null;
create index if not exists task_comments_recipient_idx on public.task_comments (recipient_id) where recipient_id is not null;

create or replace function public.tg_task_comment_notify_team()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare t record; v_proj text; v_who text; v_txt text; org uuid;
begin
  select id, title, project_id into t from public.tasks where id = new.task_id;
  if t.project_id is null then return new; end if;
  select name, organization_id into v_proj, org from public.projects where id = t.project_id;
  v_who := public.actor_name(new.owner_id, case when new.author_kind = 'cliente' then 'Cliente' else 'Equipe' end);
  v_txt := left(public.plain_text(new.body), 400);

  -- direcionada a uma pessoa da equipe: só ela é avisada (sino + e-mail)
  if new.recipient_id is not null and coalesce(new.visibility, 'equipe') = 'equipe'
     and coalesce(new.author_kind, 'equipe') = 'equipe'
     and new.recipient_id is distinct from new.owner_id
     and not public.is_client_of(t.project_id, new.recipient_id) then
    insert into public.notifications (user_id, title, body, link)
    values (new.recipient_id, 'Mensagem para você',
            left(v_proj || ' · ' || t.title || ' — ' || v_who || ': ' || v_txt, 280), public.task_link(t.id));
    insert into public.project_mail_queue
      (organization_id, project_id, user_id, audience, kind, is_message, title, body, link, actor_id)
    values (org, t.project_id, new.recipient_id, 'equipe', 'message', true, 'Mensagem para você',
            left(v_proj || ' · ' || t.title || ' — ' || v_who || ': ' || v_txt, 1000), public.task_link(t.id), new.owner_id);
    return new;
  end if;

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

-- conferência
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'task_comments' and column_name = 'recipient_id';
