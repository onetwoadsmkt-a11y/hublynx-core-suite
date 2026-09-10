# 07_fiscal.sql — correções antes da execução

Estrutura geral aprovada. Abaixo apenas os trechos corrigidos; todo o restante da migration
(enums, tabelas, índices, gatilho `trg_fill_org`, grants, policies `org ...`, `fiscal_events`
imutável e verificação final) permanece exatamente como aprovado.

## 1. Escrita restrita a admin também em `fiscal_service_codes`

O bloco genérico continua criando as 4 policies; logo depois, as de escrita das duas tabelas
de configuração são substituídas por versões com `is_org_admin`.

```sql
do $$
declare t text;
  tables text[] := array['fiscal_settings','fiscal_service_codes'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "org insert %s" on public.%I', t, t);
    execute format($p$create policy "org insert %s" on public.%I for insert to authenticated
      with check (organization_id is not null and public.is_org_admin(organization_id))$p$, t, t);
    execute format('drop policy if exists "org update %s" on public.%I', t, t);
    execute format($p$create policy "org update %s" on public.%I for update to authenticated
      using (organization_id is not null and public.is_org_admin(organization_id))
      with check (organization_id is not null and public.is_org_admin(organization_id))$p$, t, t);
    execute format('drop policy if exists "org delete %s" on public.%I', t, t);
    execute format($p$create policy "org delete %s" on public.%I for delete to authenticated
      using (organization_id is not null and public.is_org_admin(organization_id))$p$, t, t);
  end loop;
end $$;
```

## 2. Trava de empresa nos vínculos (FK composta)

Nenhuma chave existente é alterada: só adicionamos índices únicos `(id, organization_id)`
nas tabelas já existentes — necessários para a FK composta — e trocamos as FKs simples das
tabelas fiscais por FKs compostas. Como `clients`, `projects` e `finances` já têm
`organization_id NOT NULL`, o índice é sempre criável.

```sql
-- pré-requisito das FKs compostas (aditivo, não altera a PK atual)
create unique index if not exists clients_id_org_key   on public.clients   (id, organization_id);
create unique index if not exists projects_id_org_key  on public.projects  (id, organization_id);
create unique index if not exists finances_id_org_key  on public.finances  (id, organization_id);
create unique index if not exists fiscal_documents_id_org_key
  on public.fiscal_documents (id, organization_id);
create unique index if not exists fiscal_service_codes_id_org_key
  on public.fiscal_service_codes (id, organization_id);
create unique index if not exists servicos_id_org_key  on public.servicos  (id, organization_id);
```

Nas definições das tabelas fiscais, as colunas deixam de ter `references ...` inline e passam a
usar FK composta (mesma organização obrigatória):

```sql
-- fiscal_documents
  client_id uuid,
  project_id uuid,
  constraint fiscal_documents_client_org_fk
    foreign key (client_id, organization_id)
    references public.clients (id, organization_id) on delete set null,
  constraint fiscal_documents_project_org_fk
    foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete set null

-- fiscal_service_codes
  servico_id uuid,
  constraint fiscal_service_codes_servico_org_fk
    foreign key (servico_id, organization_id)
    references public.servicos (id, organization_id) on delete set null

-- fiscal_document_finances
  constraint fdf_document_org_fk
    foreign key (fiscal_document_id, organization_id)
    references public.fiscal_documents (id, organization_id) on delete cascade,
  constraint fdf_finance_org_fk
    foreign key (finance_id, organization_id)
    references public.finances (id, organization_id) on delete restrict

-- fiscal_document_items
  constraint fdi_document_org_fk
    foreign key (fiscal_document_id, organization_id)
    references public.fiscal_documents (id, organization_id) on delete cascade,
  constraint fdi_service_code_org_fk
    foreign key (fiscal_service_code_id, organization_id)
    references public.fiscal_service_codes (id, organization_id) on delete set null

-- fiscal_events
  constraint fiscal_events_document_org_fk
    foreign key (fiscal_document_id, organization_id)
    references public.fiscal_documents (id, organization_id) on delete cascade
```

Observação: com FK composta, o gatilho `trg_fill_org` continua preenchendo
`organization_id` antes da checagem (é `before insert`), então nada quebra no padrão atual.
Se algum índice único acima falhar por dado inconsistente, a migration para ali e nada é
aplicado pela metade — basta corrigir o registro e reexecutar.

## 3. Policies de storage com validação do caminho

Valida o formato antes do cast e confere que a pasta do documento pertence à mesma empresa.

```sql
create or replace function public.fiscal_storage_allowed(_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select _name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.+'
     and public.is_org_member(split_part(_name, '/', 1)::uuid)
     and exists (
       select 1 from public.fiscal_documents d
       where d.id = split_part(_name, '/', 2)::uuid
         and d.organization_id = split_part(_name, '/', 1)::uuid
     )
$$;
revoke all on function public.fiscal_storage_allowed(text) from public, anon;
grant execute on function public.fiscal_storage_allowed(text) to authenticated, service_role;

drop policy if exists "fiscal files read" on storage.objects;
create policy "fiscal files read" on storage.objects for select to authenticated
  using (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name));
drop policy if exists "fiscal files write" on storage.objects;
create policy "fiscal files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name));
```

Caminho obrigatório: `{organization_id}/{fiscal_document_id}/arquivo.(pdf|xml)`.

## 4. `created_by` com padrão `auth.uid()`

```sql
-- em fiscal_documents e fiscal_events
created_by uuid default auth.uid() references auth.users(id)
```

Fica sem `not null` de propósito: rotinas de servidor (service role) gravam sem usuário.

## Próximo passo

Aprovando, eu crio `supabase/migrations-org/07_fiscal.sql` já com estas quatro correções
incorporadas. A execução no Supabase continua manual, feita por você.
