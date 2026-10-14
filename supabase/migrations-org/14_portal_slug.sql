-- 14 — Número do projeto e link personalizado do portal: <numero>-<cliente>-<empresa>
alter table public.projects
  add column if not exists project_number integer,
  add column if not exists portal_slug text;

create or replace function public.slugify_pt(_t text)
returns text language sql immutable set search_path = public as $$
  select trim(both '-' from regexp_replace(
           lower(translate(coalesce(_t, ''),
             'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
             'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),
           '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.project_default_slug(_project uuid)
returns text language sql stable security definer set search_path = public as $$
  select left(concat_ws('-',
           p.project_number::text,
           nullif(public.slugify_pt(coalesce(c.name, p.name)), ''),
           nullif(public.slugify_pt(o.name), '')), 120)
  from public.projects p
  left join public.clients c on c.id = p.client_id
  left join public.organizations o on o.id = p.organization_id
  where p.id = _project
$$;

-- numera os projetos existentes por empresa, na ordem de criação
with n as (
  select id, row_number() over (partition by organization_id order by created_at, id) rn
  from public.projects where project_number is null
)
update public.projects p set project_number = n.rn
  + coalesce((select max(project_number) from public.projects x
              where x.organization_id = p.organization_id and x.project_number is not null), 0)
from n where n.id = p.id;

update public.projects p set portal_slug = public.project_default_slug(p.id) where portal_slug is null;

create unique index if not exists projects_portal_slug_uq on public.projects (portal_slug) where portal_slug is not null;
create unique index if not exists projects_org_number_uq on public.projects (organization_id, project_number) where project_number is not null;

-- novo projeto: próximo número da empresa e link padrão
create or replace function public.tg_projects_number_slug()
returns trigger language plpgsql security definer set search_path = public as $$
declare base text; candidate text; i int := 1;
begin
  if new.project_number is null and new.organization_id is not null then
    perform pg_advisory_xact_lock(hashtext('project_number:' || new.organization_id::text));
    select coalesce(max(project_number), 0) + 1 into new.project_number
      from public.projects where organization_id = new.organization_id;
  end if;
  if new.portal_slug is null or btrim(new.portal_slug) = '' then
    base := left(concat_ws('-', new.project_number::text,
              nullif(public.slugify_pt(coalesce((select name from public.clients where id = new.client_id), new.name)), ''),
              nullif(public.slugify_pt((select name from public.organizations where id = new.organization_id)), '')), 120);
    candidate := base;
    while exists (select 1 from public.projects where portal_slug = candidate and id <> new.id) loop
      i := i + 1; candidate := base || '-' || i;
    end loop;
    new.portal_slug := candidate;
  else
    new.portal_slug := left(public.slugify_pt(new.portal_slug), 120);
  end if;
  return new;
end $$;
drop trigger if exists trg_projects_number_slug on public.projects;
create trigger trg_projects_number_slug before insert or update of portal_slug on public.projects
  for each row execute function public.tg_projects_number_slug();

-- portal: aceita o link personalizado ou o id
create or replace function public.portal_resolve(_ref text)
returns uuid language sql stable security definer set search_path = public as $$
  select p.id from public.projects p
  where (p.portal_slug = lower(_ref) or p.id::text = _ref)
    and public.is_project_client(p.id)
  limit 1
$$;

create or replace function public.portal_my_projects()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'slug', coalesce(p.portal_slug, p.id::text), 'number', p.project_number,
    'name', p.name, 'status', p.status,
    'start_date', p.start_date, 'due_date', p.due_date,
    'organization', jsonb_build_object('name', o.name, 'logo_url', o.logo_url, 'brand_color', o.brand_color),
    'stages_total', (select count(*) from project_stages s where s.project_id = p.id),
    'stages_done',  (select count(*) from project_stages s where s.project_id = p.id and s.status = 'done'),
    'progress', coalesce((select round(avg(s.percent)) from project_stages s where s.project_id = p.id), 0),
    'my_open_tasks', (select count(*) from tasks t where t.project_id = p.id
                      and t.responsible_type = 'cliente' and t.status not in ('concluido','cancelado'))
  ) order by p.created_at desc), '[]'::jsonb)
  from public.projects p
  join public.organizations o on o.id = p.organization_id
  where public.is_project_client(p.id)
$$;

revoke execute on function public.portal_resolve(text) from public, anon;
grant execute on function public.portal_resolve(text) to authenticated;
revoke execute on function public.project_default_slug(uuid) from public, anon;
grant execute on function public.project_default_slug(uuid) to authenticated;

