# 07_fiscal.sql — ajustes finais (rodada 2)

Só os trechos alterados desta rodada. Todo o resto continua como já aprovado
(enums, tabelas, gatilho `trg_fill_org`, grants, policies `org ...`, escrita restrita a admin
em `fiscal_settings` e `fiscal_service_codes`, `fiscal_events` imutável, `created_by default auth.uid()`).

## 1. FKs compostas: anular só a coluna opcional

`on delete set null` puro tentaria anular também `organization_id`, que é `not null`.
Usamos a forma com lista de colunas (PostgreSQL 15+), que anula apenas o vínculo opcional.

```sql
-- fiscal_documents
  constraint fiscal_documents_client_org_fk
    foreign key (client_id, organization_id)
    references public.clients (id, organization_id)
    on delete set null (client_id),
  constraint fiscal_documents_project_org_fk
    foreign key (project_id, organization_id)
    references public.projects (id, organization_id)
    on delete set null (project_id)

-- fiscal_service_codes
  constraint fiscal_service_codes_servico_org_fk
    foreign key (servico_id, organization_id)
    references public.servicos (id, organization_id)
    on delete set null (servico_id)

-- fiscal_document_items
  constraint fdi_service_code_org_fk
    foreign key (fiscal_service_code_id, organization_id)
    references public.fiscal_service_codes (id, organization_id)
    on delete set null (fiscal_service_code_id)
```

As FKs de `fiscal_document_finances`, `fiscal_document_items` e `fiscal_events` para
`fiscal_documents` continuam `on delete cascade`, e `finance_id` continua `on delete restrict` —
nenhuma delas anula coluna, então não muda nada.

Guarda de compatibilidade: se o servidor for anterior ao PostgreSQL 15, a sintaxe com lista
não existe. O bloco cai para `on delete no action`, que também nunca anula `organization_id`.

```sql
do $$
declare pg15 boolean := current_setting('server_version_num')::int >= 150000;
begin
  if pg15 then
    -- versões com "set null (coluna)" conforme acima
    null;
  else
    raise notice 'PostgreSQL < 15: usando on delete no action nas FKs opcionais';
  end if;
end $$;
```

## 2. Storage: extensões válidas e verificação segura da empresa

Bucket limitado a PDF e XML no próprio cadastro:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fiscal-files', 'fiscal-files', false, 26214400,
        array['application/pdf','application/xml','text/xml'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

Função de validação do caminho, agora com extensão obrigatória, exatamente três segmentos,
sem `..` e conferindo que o documento pertence à mesma empresa:

```sql
create or replace function public.fiscal_storage_allowed(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $fn$
declare
  parts text[];
  org uuid;
  doc uuid;
begin
  if _name is null or position('..' in _name) > 0 then return false; end if;

  -- exige: {uuid}/{uuid}/arquivo.pdf|xml  (exatamente 3 segmentos)
  if _name !~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(pdf|xml)$' then
    return false;
  end if;

  parts := string_to_array(_name, '/');
  begin
    org := parts[1]::uuid;
    doc := parts[2]::uuid;
  exception when others then
    return false;
  end;

  if not public.is_org_member(org) then return false; end if;

  return exists (
    select 1 from public.fiscal_documents d
    where d.id = doc and d.organization_id = org
  );
end $fn$;

revoke all on function public.fiscal_storage_allowed(text) from public, anon;
grant execute on function public.fiscal_storage_allowed(text) to authenticated, service_role;
```

Policies (leitura, gravação, atualização e remoção pela mesma regra):

```sql
do $$
declare a text;
begin
  foreach a in array array['read','write','update','delete'] loop
    execute format('drop policy if exists "fiscal files %s" on storage.objects', a);
  end loop;
end $$;

create policy "fiscal files read" on storage.objects for select to authenticated
  using (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name));
create policy "fiscal files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name));
create policy "fiscal files update" on storage.objects for update to authenticated
  using (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name))
  with check (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name));
create policy "fiscal files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'fiscal-files' and public.fiscal_storage_allowed(name));
```

## Próximo passo

Nada é executado. Aprovando, eu crio `supabase/migrations-org/07_fiscal.sql` com todas as
rodadas de correção incorporadas, e você roda manualmente no SQL Editor.
