-- 19 — Cronograma por fases e semanas (15/10/2026)
-- Modelos e projetos passam a ter, em cada etapa:
--   phase              fase (ex.: "1ª Fase · Dias 1 a 30")
--   week_label         semana (ex.: "1ª semana")
--   start_offset_days  dia de início contado a partir do início do projeto (0 = primeiro dia)
--   duration_days      duração da etapa em dias
--   alert              aviso importante da etapa (⚠️)
-- Com isso o cronograma é recalculado quando a data de início muda, e cada etapa
-- pode ser adiada/adiantada levando as seguintes junto.
-- O portal do cliente passa a receber fase, semana e aviso de cada etapa.
-- Pode rodar mais de uma vez.

begin;

alter table public.project_template_stages
  add column if not exists phase text,
  add column if not exists week_label text,
  add column if not exists start_offset_days integer,
  add column if not exists alert text;

alter table public.project_stages
  add column if not exists phase text,
  add column if not exists week_label text,
  add column if not exists start_offset_days integer,
  add column if not exists duration_days integer,
  add column if not exists alert text;

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

commit;
