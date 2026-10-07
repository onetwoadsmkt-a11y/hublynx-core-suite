-- 09 — Catálogo de módulos (07/10/2026)
--
-- Separa "Tarefas & Agenda" de Projetos e cria o módulo Fiscal.
-- Base (Hub, Minha semana, Clientes, Configurações) não é módulo: fica sempre ativa.
-- Somente inserções: nenhuma linha existente é apagada ou alterada, exceto a ordem
-- de exibição dos módulos.
--
-- Catálogo final:
--   1 crm       Comercial          Pipeline, Leads, Atendimento, painel e relatórios comerciais
--   2 tasks     Tarefas & Agenda   Tarefas (lista, kanban, calendário) e Agenda
--   3 projects  Projetos           Projetos, etapas, modelos, relatórios de gestão (depende de tasks)
--   4 finance   Financeiro         Dashboard, receber, pagar, previsão, serviços, categorias
--   5 fiscal    Fiscal             Notas fiscais NFS-e (depende de finance)

begin;

insert into public.modules (code, name, description, active, public, sort_order)
values
  ('tasks',  'Hublynx Tarefas & Agenda', 'Tarefas em lista, kanban e calendário, e agenda.', true, true, 2),
  ('fiscal', 'Hublynx Fiscal',           'Emissão e controle de notas fiscais (NFS-e).',     true, false, 5)
on conflict (code) do nothing;

update public.modules set name = 'Hublynx Comercial', sort_order = 1 where code = 'crm';
update public.modules set sort_order = 3 where code = 'projects';
update public.modules set sort_order = 4 where code = 'finance';

-- Quem tem Projetos passa a ter Tarefas & Agenda (antes vinham juntos).
insert into public.organization_modules (organization_id, module_id, enabled, activated_at)
select om.organization_id, t.id, om.enabled, now()
from public.organization_modules om
join public.modules p on p.id = om.module_id and p.code = 'projects'
cross join public.modules t
where t.code = 'tasks'
on conflict (organization_id, module_id) do nothing;

insert into public.user_module_permissions (organization_id, user_id, module_id, can_access, permissions)
select ump.organization_id, ump.user_id, t.id, ump.can_access, '{}'::jsonb
from public.user_module_permissions ump
join public.modules p on p.id = ump.module_id and p.code = 'projects'
cross join public.modules t
where t.code = 'tasks'
on conflict do nothing;

commit;
