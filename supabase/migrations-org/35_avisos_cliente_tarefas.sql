-- 35 — Portal do cliente: aviso no sino (com som) e por e-mail das tarefas agendadas para o cliente (03/11/2026)
-- Tarefa do cliente criada (ou passada para o cliente) → "Nova tarefa para você" para os clientes do projeto.
-- Prazo de tarefa do cliente alterado → "Prazo da sua tarefa alterado". O link abre o portal do projeto.
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
  v_link := '/portal/' || slug;

  for uid in select * from public.project_clients(new.project_id) loop
    continue when uid = coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid);
    -- o aviso "Nova tarefa para você" do responsável (link do Core) passa a abrir o portal
    update public.notifications set link = v_link
     where user_id = uid and title = 'Nova tarefa para você' and link not like '/portal/%'
       and created_at > now() - interval '1 minute';
    if not exists (
      select 1 from public.notifications n
       where n.user_id = uid and n.title = v_title and n.link = v_link
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
