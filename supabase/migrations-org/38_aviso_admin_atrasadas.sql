-- 38 · Aviso de tarefas atrasadas para os administradores da empresa
-- O Core passa a avisar os administradores (sino + e-mail próprio com a lista) quando uma
-- tarefa de projeto ativo entra em atraso. Este arquivo só inclui o título desse aviso na
-- lista dos que já têm e-mail próprio, para o aviso do sino não gerar um segundo e-mail.
-- Não altera nem apaga dados.

create or replace function public.tg_notification_to_mail()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_project uuid;
  v_task uuid;
  v_org uuid;
  v_aud text := 'equipe';
  v_key text;
begin
  -- já têm e-mail próprio (enviado pelo Core assim que a tarefa é agendada / resumo do dia)
  if new.title in ('Nova tarefa para você', 'Você foi atribuído a uma tarefa',
                   'Você tem tarefas atrasadas', 'Tarefas para hoje',
                   'Tarefas atrasadas nos projetos') then
    return new;
  end if;

  -- projeto / tarefa a partir do link do aviso
  v_key := substring(coalesce(new.link, '') from '/projetos/([0-9a-fA-F-]{36})');
  if v_key is not null then v_project := v_key::uuid; end if;
  v_key := substring(coalesce(new.link, '') from '(?:task|tarefa)=([0-9a-fA-F-]{36})');
  if v_key is not null then v_task := v_key::uuid; end if;
  if coalesce(new.link, '') like '/portal/%' then
    v_aud := 'cliente';
    v_key := split_part(split_part(substr(new.link, 9), '/', 1), '?', 1);
    select id into v_project from public.projects
     where portal_slug = v_key or id::text = v_key limit 1;
  end if;

  if v_project is null and v_task is not null then
    select project_id, organization_id into v_project, v_org from public.tasks where id = v_task;
  end if;
  if v_project is not null then
    select organization_id into v_org from public.projects where id = v_project;
  end if;
  if v_org is null then
    select organization_id into v_org from public.organization_members
     where user_id = new.user_id and status = 'active' order by created_at limit 1;
  end if;
  if v_org is null then return new; end if;

  insert into public.project_mail_queue
    (organization_id, project_id, user_id, audience, kind, is_message, title, body, link, actor_id)
  values (v_org, v_project, new.user_id, v_aud, 'bell',
          new.title ilike '%mensagem%' or new.title ilike '%mencionado%',
          new.title, left(coalesce(new.body, ''), 1000), new.link, null);
  return new;
exception when others then
  -- o aviso no sino nunca deixa de ser gravado por causa do e-mail
  return new;
end $$;
revoke execute on function public.tg_notification_to_mail() from public, anon, authenticated;

-- conferência: deve mostrar true
select position('Tarefas atrasadas nos projetos' in pg_get_functiondef('public.tg_notification_to_mail()'::regprocedure)) > 0 as ok;
