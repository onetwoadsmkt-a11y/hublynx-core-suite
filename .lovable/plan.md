# Etapa 6 — Endurecimento multi-tenant: códigos completos para colar no Supabase

Arquivo fonte: `supabase/migrations-org/06_hardening.sql`

Execute no **SQL Editor do Supabase** (`gyxzrnoxzaraossrqyuc`), **bloco por bloco**, na ordem abaixo. Nenhum bloco apaga dados.

---

## Bloco A — CONFERÊNCIA (rodar sozinho primeiro)

**Objetivo:** verificar se ainda existe algum registro sem `organization_id`.

**Resultado esperado:** a última consulta deve retornar **0 linhas**. Se aparecer alguma linha, pare e me avise qual tabela e quantos registros.

```sql
-- ============================================================
-- BLOCO A — CONFERÊNCIA (rodar sozinho primeiro)
-- Todos os resultados de "pendentes" precisam ser 0.
-- ============================================================
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

---

## Bloco A2 — Gatilhos de preenchimento automático de organization_id

**Objetivo:** garantir que todo INSERT futuro (app, webhook, service role) preencha `organization_id` automaticamente, mesmo em telas antigas que ainda enviam apenas `owner_id`/`user_id`.

```sql
-- ============================================================
-- BLOCO A2 — preenchimento automático de organization_id em novos registros.
-- Garante que qualquer INSERT (app, webhook, service role) grave a organização,
-- mesmo em telas antigas que ainda enviam apenas owner_id/user_id.
-- ============================================================
create or replace function public.fill_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare org uuid;
begin
  if new.organization_id is not null then return new; end if;

  -- 1) organização do usuário autenticado (a única, se houver só uma)
  if auth.uid() is not null then
    select m.organization_id into org
    from public.organization_members m
    where m.user_id = auth.uid() and coalesce(m.status,'active') = 'active'
    order by m.created_at nulls last
    limit 1;
  end if;

  -- 2) fallback pelo dono do registro (webhooks e rotinas de servidor)
  if org is null then
    begin
      select o.id into org from public.organizations o
      where o.legacy_owner_id = coalesce(
        to_jsonb(new) ->> 'owner_id', to_jsonb(new) ->> 'user_id'
      )::uuid;
    exception when others then org := null;
    end;
  end if;

  new.organization_id := org;
  return new;
end $fn$;

do $$
declare t text;
  tables text[] := array[
    'leads','clients','projects','finances','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','files',
    'servicos','contas','baixas'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists trg_fill_org on public.%I', t);
    execute format('create trigger trg_fill_org before insert on public.%I
      for each row execute function public.fill_organization_id()', t);
  end loop;
end $$;
```

---

## Bloco B — organization_id NOT NULL

**Objetivo:** tornar `organization_id` obrigatório nas tabelas de negócio.

**ATENÇÃO:** rode SOMENTE se o Bloco A não retornou nenhuma linha. `finance_categories` fica de fora (categorias globais podem ter organização nula).

```sql
-- ============================================================
-- BLOCO B — organization_id NOT NULL
-- Rodar SOMENTE se o bloco A não retornou nenhuma linha.
-- finance_categories fica de fora (categorias globais podem ter organização nula).
-- ============================================================
do $$
declare t text;
  tables text[] := array[
    'leads','clients','projects','finances','tasks',
    'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
    'lead_webhooks','kanban_columns','task_labels','files',
    'servicos','contas','baixas'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t
                 and column_name='organization_id' and is_nullable='YES') then
      execute format('alter table public.%I alter column organization_id set not null', t);
    end if;
  end loop;
end $$;
```

---

## Bloco C1 — Relatório das policies antigas que serão removidas

**Objetivo:** mostrar todas as policies baseadas em `owner_id` / `user_id` / `empresa_id` que ainda existem, para conferência antes da remoção.

```sql
-- ============================================================
-- BLOCO C — remover policies antigas por owner_id / user_id
-- C1: relatório do que será removido (rodar e conferir).
-- ============================================================
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

**Resultado esperado:** lista das policies antigas. Antes de rodar C2, confirme visualmente que todas as tabelas listadas já possuem as policies `org ...` correspondentes.

---

## Bloco C2 — Remoção efetiva das policies antigas

**Objetivo:** remover as policies baseadas em `owner_id` / `user_id` / `empresa_id`, mantendo apenas as policies por organização (`org ...`).

```sql
-- C2: remoção efetiva (rodar depois de conferir o relatório de C1).
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in (
        'leads','clients','projects','finances','tasks',
        'pipelines','pipeline_stages','lead_notes','lead_events','lead_tasks','lead_files',
        'lead_webhooks','kanban_columns','task_labels','files','servicos','contas','baixas'
      )
      and policyname not like 'org %'
      and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(owner_id|user_id|empresa_id)'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
```

---

## Bloco D — Verificação final

**Objetivo:** confirmar que cada tabela ficou com 4 policies `org ...` (SELECT, INSERT, UPDATE, DELETE).

```sql
-- ============================================================
-- BLOCO D — verificação final: cada tabela precisa ter 4 policies "org ..."
-- ============================================================
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

**Resultado esperado:** cada tabela listada deve ter `policies_org = 4`.

---

## Ordem de execução resumida

1. **Bloco A** → deve retornar 0 linhas.
2. **Bloco A2** → cria gatilhos.
3. **Bloco B** → NOT NULL (só se A deu 0).
4. **Bloco C1** → mostra policies antigas.
5. **Bloco C2** → remove policies antigas.
6. **Bloco D** → confere 4 policies `org ...` por tabela.

Me envie o resultado de cada bloco antes de prosseguir para o próximo.
