-- 16 — Varredura do módulo Projetos (14/10/2026)
-- 1) Riscos, notas, marcos, custos e histórico do projeto passam a ser da EQUIPE do projeto
--    (antes só quem criou via). Segue as mesmas regras do projeto:
--    ver = can_view_project, criar/editar/excluir = can_edit_project.
--    As regras antigas ("dono" e admin da plataforma) continuam valendo.
-- 2) Funções internas (gatilhos e geração de link) deixam de ser chamáveis pela API.
-- Pode rodar mais de uma vez.

begin;

-- 1) Compartilhar com a equipe do projeto -----------------------------------
do $$
declare t text;
begin
  foreach t in array array['project_risks','project_notes','project_milestones','project_costs'] loop
    execute format('drop policy if exists "project team read" on public.%I', t);
    execute format('drop policy if exists "project team write" on public.%I', t);
    execute format(
      'create policy "project team read" on public.%I for select to authenticated
         using (public.can_view_project(project_id))', t);
    execute format(
      'create policy "project team write" on public.%I for all to authenticated
         using (public.can_edit_project(project_id))
         with check (public.can_edit_project(project_id))', t);
  end loop;
end $$;

-- histórico: a equipe lê; quem edita o projeto registra
drop policy if exists "project team read" on public.project_activity;
drop policy if exists "project team write" on public.project_activity;
create policy "project team read" on public.project_activity for select to authenticated
  using (public.can_view_project(project_id));
create policy "project team write" on public.project_activity for insert to authenticated
  with check (public.can_edit_project(project_id));

-- 2) Funções internas fora da API ------------------------------------------
-- (gatilhos continuam funcionando: o banco não exige essa permissão para disparar gatilho)
revoke execute on function public.tg_project_members_org() from public, anon, authenticated;
revoke execute on function public.tg_projects_number_slug() from public, anon, authenticated;
revoke execute on function public.tg_tasks_stage_progress() from public, anon, authenticated;
revoke execute on function public.guard_organizations_update() from public, anon, authenticated;
revoke execute on function public.project_default_slug(uuid) from public, anon, authenticated;

commit;
