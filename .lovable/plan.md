# Etapa 6 — Endurecimento multi-tenant: o que rodar

Arquivo: `supabase/migrations-org/06_hardening.sql`

Execute no **SQL Editor do Supabase** (`gyxzrnoxzaraossrqyuc`), **bloco por bloco**, na ordem abaixo. Nenhum bloco apaga dados.

---

## Passo 1 — Bloco A (conferência)

Cole do início do arquivo até a linha 26 (inclusive o `select * from _pendentes`).

```sql
do $$
declare t text; n bigint;
  tables text[] := array[
    'leads','clients','projects','finances','finance_categories','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','google_sheets_sync','forms','files',
    'servicos','contas','baixas','subscriptions','user_modules'
  ];
begin
  create temp table if not exists _pendentes(tabela text, pendentes bigint) on commit drop;
  delete from _pendentes;
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*) from public.%I where organization_id is null', t) into n;
    insert into _pendentes values (t, n);
  end loop;
end $$;
select * from _pendentes where pendentes > 0 order by pendentes desc;
```

**Resultado esperado:** a consulta final deve retornar **0 linhas**.

Se aparecer alguma tabela com pendentes > 0, pare aqui e me avise qual tabela e quantos. Não prossiga para o Bloco B.

---

## Passo 2 — Bloco A2 (gatilhos de preenchimento automático)

Cole do `create or replace function public.fill_organization_id()` até o final do bloco A2 (linha 82).

Esse bloco cria uma função que preenche `organization_id` sozinho em todo INSERT futuro, mesmo que a tela ou webhook ainda não envie o campo.

**Resultado esperado:** mensagem de sucesso, sem erros.

---

## Passo 3 — Bloco B (NOT NULL)

Cole o bloco B completo (linhas 89–106).

**Só rode se o Bloco A não retornou nenhuma linha.**

Esse bloco torna `organization_id` obrigatório nas tabelas de negócio. `finance_categories` fica de fora porque pode ter categorias globais sem organização.

**Resultado esperado:** sucesso, sem erros.

---

## Passo 4 — Bloco C1 (relatório de policies antigas)

Cole o bloco C1 (linhas 112–122).

```sql
select tablename, policyname, cmd, coalesce(qual, with_check) as regra
from pg_policies
where schemaname = 'public'
  and tablename in (
    'leads','clients','projects','finances','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','files','servicos','contas','baixas'
  )
  and policyname not like 'org %'
  and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(owner_id|user_id|empresa_id)'
order by tablename, policyname;
```

**Resultado esperado:** lista das policies antigas que serão removidas. Confira se todas as tabelas já possuem as policies `org ...` correspondentes antes de rodar C2.

---

## Passo 5 — Bloco C2 (remoção das policies antigas)

Cole o bloco C2 completo (linhas 125–141).

Esse bloco remove as regras antigas baseadas em `owner_id` / `user_id` / `empresa_id`, deixando apenas as policies por organização.

**Resultado esperado:** sucesso, sem erros.

---

## Passo 6 — Bloco D (verificação final)

Cole o bloco D completo (linhas 146–155).

```sql
select tablename, count(*) filter (where policyname like 'org %') as policies_org,
       count(*) as policies_total
from pg_policies
where schemaname='public'
  and tablename in (
    'leads','clients','projects','finances','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','files','servicos','contas','baixas'
  )
group by tablename order by tablename;
```

**Resultado esperado:** cada tabela listada deve ter `policies_org = 4` (SELECT, INSERT, UPDATE, DELETE por organização).

---

## Resumo da ordem

1. Bloco A → conferir se retorna 0 linhas.
2. Bloco A2 → criar gatilhos.
3. Bloco B → NOT NULL.
4. Bloco C1 → conferir policies antigas.
5. Bloco C2 → remover policies antigas.
6. Bloco D → conferir 4 policies `org ...` por tabela.

Após cada passo, me envie o resultado (print ou texto) antes de prosseguir para o próximo.
