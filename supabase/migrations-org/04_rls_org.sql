-- ETAPA 1.4 — policies ADICIONAIS por organização + Storage por organização.
-- Nenhuma policy existente é removida; as regras por owner_id continuam valendo.
-- Rodar somente depois que o arquivo 03 não apresentar pendentes.

do $$
declare t text;
  tables text[] := array[
    'leads','clients','projects','finances','finance_categories','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','google_sheets_sync','forms','files',
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

-- subscriptions: leitura pelos membros da organização; escrita só super admin (além das policies atuais)
drop policy if exists "org members read subscription" on public.subscriptions;
create policy "org members read subscription" on public.subscriptions for select to authenticated
  using (organization_id is not null and public.is_org_member(organization_id));
drop policy if exists "super admin manages subscriptions" on public.subscriptions;
create policy "super admin manages subscriptions" on public.subscriptions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------- Storage: bucket privado por organização ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('org-files', 'org-files', false, 52428800)
on conflict (id) do nothing;

-- caminho: {organization_id}/{crm|projects}/...
drop policy if exists "org files read" on storage.objects;
create policy "org files read" on storage.objects for select to authenticated
  using (bucket_id = 'org-files' and public.is_org_member((storage.foldername(name))[1]::uuid));
drop policy if exists "org files write" on storage.objects;
create policy "org files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-files' and public.is_org_member((storage.foldername(name))[1]::uuid));
drop policy if exists "org files update" on storage.objects;
create policy "org files update" on storage.objects for update to authenticated
  using (bucket_id = 'org-files' and public.is_org_member((storage.foldername(name))[1]::uuid));
drop policy if exists "org files delete" on storage.objects;
create policy "org files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'org-files' and public.is_org_member((storage.foldername(name))[1]::uuid));

-- Verificação
select tablename, count(*) as org_policies from pg_policies
where schemaname = 'public' and policyname like 'org %'
group by tablename order by tablename;
