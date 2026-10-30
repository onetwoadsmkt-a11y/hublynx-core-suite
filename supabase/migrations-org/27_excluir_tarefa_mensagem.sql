-- 27 — Excluir tarefa e mensagem, com registro no histórico (30/10/2026)
-- Tarefa excluída: fica com status "cancelado" (sai das etapas e do portal) e o
-- histórico já registra quem excluiu e quando (status_changed → cancelado).
-- Mensagem excluída: o servidor grava em task_history a ação "comment_deleted"
-- (texto, destino, quem e quando) antes de apagar; o histórico do projeto passa a mostrar.
-- Rodar DEPOIS da 23. Pode rodar mais de uma vez.

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
           case when h.action in ('file_deleted','comment_deleted') then h.old_value
                when h.action in ('status_changed','file_uploaded','due_date_changed','task_edited') then h.new_value
           end as detail,
           case when h.action in ('status_changed','task_edited') then h.old_value end as old,
           case when h.action = 'comment_deleted' then h.field end as visibility
    from public.task_history h
    join public.tasks t on t.id = h.task_id
    left join public.project_stages s on s.id = t.stage_id
    where t.project_id = _project
      and h.action in ('task_created','task_edited','status_changed','file_uploaded',
                       'file_deleted','due_date_changed','assignee_changed','comment_deleted')
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

revoke execute on function public.project_journey(uuid, int) from public, anon;
grant execute on function public.project_journey(uuid, int) to authenticated;
