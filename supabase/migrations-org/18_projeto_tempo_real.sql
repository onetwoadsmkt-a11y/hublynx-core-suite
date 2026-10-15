-- 18 — Atualização em tempo real do projeto (15/10/2026)
-- Toda mudança no projeto (tarefas, comentários, arquivos, etapas, mensagens,
-- equipe e dados do projeto), feita pelo Core ou pelo portal, dispara um aviso
-- no canal privado "project:<id>". O aviso não leva dados: quem está com o
-- projeto aberto recarrega pelas funções normais, que conferem a permissão.
-- Só ouve o canal quem é da equipe do projeto ou o cliente dele.
-- Pode rodar mais de uma vez.

begin;

-- quem pode ouvir o canal do projeto
create or replace function public.project_event_topic_ok(_topic text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare pid uuid;
begin
  if _topic is null or _topic !~ '^project:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  pid := substr(_topic, 9)::uuid;
  return public.can_view_project(pid) or public.is_project_client(pid);
end $$;
revoke execute on function public.project_event_topic_ok(text) from public, anon;
grant execute on function public.project_event_topic_ok(text) to authenticated;

drop policy if exists "project events: receive" on realtime.messages;
create policy "project events: receive" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.project_event_topic_ok((select realtime.topic()))
  );

-- aviso de mudança (nunca impede a gravação)
create or replace function public.tg_project_event()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  pid uuid;
  tid uuid;
begin
  if tg_table_name = 'projects' then
    pid := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'task_comments' then
    tid := case when tg_op = 'DELETE' then old.task_id else new.task_id end;
    select project_id into pid from public.tasks where id = tid;
  elsif tg_op = 'DELETE' then
    pid := old.project_id;
  else
    pid := new.project_id;
    -- tarefa trocada de projeto: avisa o projeto antigo também
    if tg_op = 'UPDATE' and tg_table_name = 'tasks' and old.project_id is distinct from new.project_id
       and old.project_id is not null then
      perform realtime.send(jsonb_build_object('table', tg_table_name, 'op', tg_op),
                            'changed', 'project:' || old.project_id::text, true);
    end if;
  end if;
  if pid is not null then
    perform realtime.send(jsonb_build_object('table', tg_table_name, 'op', tg_op),
                          'changed', 'project:' || pid::text, true);
  end if;
  return null;
exception when others then
  return null;
end $$;
revoke execute on function public.tg_project_event() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['projects','tasks','task_comments','task_attachments','project_stages',
                           'project_messages','project_members','project_risks','project_notes',
                           'project_milestones','project_costs'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists tg_project_event on public.%I', t);
      execute format('create trigger tg_project_event after insert or update or delete on public.%I
                        for each row execute function public.tg_project_event()', t);
    end if;
  end loop;
end $$;

commit;
