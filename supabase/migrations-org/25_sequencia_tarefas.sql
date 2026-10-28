-- 25 — Sequência das tarefas do projeto igual à do modelo (ordem da planilha)
-- (28/10/2026). Não altera título, descrição, datas, responsável nem status:
-- só preenche tasks.position (ordem dentro da etapa).
-- Rodar DEPOIS da 23. Pode rodar mais de uma vez.

begin;

-- 1) Tarefas criadas a partir de um modelo: posição = ordem da tarefa no modelo
--    (casando etapa pelo nome e tarefa pelo título, dentro do modelo do projeto).
with alvo as (
  select t.id,
         ptt.sort_order as pos
  from public.tasks t
  join public.project_stages ps on ps.id = t.stage_id
  join public.projects p on p.id = t.project_id
  join public.project_template_stages pts
    on pts.template_id = p.template_id and lower(trim(pts.name)) = lower(trim(ps.name))
  join public.project_template_tasks ptt
    on ptt.stage_id = pts.id and lower(trim(ptt.title)) = lower(trim(t.title))
  where t.stage_id is not null
)
update public.tasks t
   set position = alvo.pos
  from alvo
 where alvo.id = t.id
   and t.position is distinct from alvo.pos;

-- 2) Tarefas que não estão no modelo (incluídas à mão): vão para o fim da etapa,
--    na ordem em que foram criadas.
with fora as (
  select t.id,
         1000 + row_number() over (partition by t.stage_id order by t.created_at) as pos
  from public.tasks t
  join public.project_stages ps on ps.id = t.stage_id
  join public.projects p on p.id = t.project_id
  where t.stage_id is not null
    and not exists (
      select 1
      from public.project_template_stages pts
      join public.project_template_tasks ptt on ptt.stage_id = pts.id
      where pts.template_id = p.template_id
        and lower(trim(pts.name)) = lower(trim(ps.name))
        and lower(trim(ptt.title)) = lower(trim(t.title))
    )
)
update public.tasks t
   set position = fora.pos
  from fora
 where fora.id = t.id
   and t.position is distinct from fora.pos;

-- 3) Portal do cliente: mesma sequência
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
                 order by t.position, t.due_date nulls last, t.created_at)
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

commit;

-- Conferência (opcional): sequência da etapa "Equipe, treinamento e check-list final"
-- select ps.name, t.position, t.title from tasks t join project_stages ps on ps.id = t.stage_id
--  where ps.name = 'Equipe, treinamento e check-list final' order by t.project_id, t.position;
