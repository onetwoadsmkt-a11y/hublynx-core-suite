-- Fase 4 — policies ADICIONAIS por organização.
-- Nenhuma policy existente é removida; as regras por owner_id continuam valendo.
-- Rodar somente depois que a fase 3 não apresentar pendências.

do $$
declare
  t text;
  tables text[] := array[
    'leads','clients','projects','finances','finance_categories','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks',
    'lead_webhooks','kanban_columns','task_labels','google_sheets_sync','forms',
    'servicos','contas','baixas'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);

    execute format('drop policy if exists "org select %s" on public.%I', t, t);
    execute format($p$create policy "org select %s" on public.%I for select to authenticated
      using (organization_id is not null and public.is_org_member(organization_id))$p$, t, t);

    execute format('drop policy if exists "org insert %s" on public.%I', t, t);
    execute format($p$create policy "org insert %s" on public.%I for insert to authenticated
      with check (organization_id is not null and public.is_org_member(organization_id))$p$, t, t);

    execute format('drop policy if exists "org update %s" on public.%I', t, t);
    execute format($p$create policy "org update %s" on public.%I for update to authenticated
      using (organization_id is not null and public.is_org_member(organization_id))
      with check (organization_id is not null and public.is_org_member(organization_id))$p$, t, t);

    execute format('drop policy if exists "org delete %s" on public.%I', t, t);
    execute format($p$create policy "org delete %s" on public.%I for delete to authenticated
      using (organization_id is not null and public.is_org_member(organization_id))$p$, t, t);
  end loop;
end $$;

-- Verificação: policies por organização criadas
select tablename, policyname from pg_policies
where schemaname = 'public' and policyname like 'org %'
order by tablename, policyname;
