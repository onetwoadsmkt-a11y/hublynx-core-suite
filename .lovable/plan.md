# Estrutura fiscal NFS-e (padrão nacional / SEFIN DPS) — somente schema

Nada é apagado, renomeado ou duplicado. Nenhuma estrutura de empresas nova. Todas as tabelas
reutilizam `organization_id`, o gatilho `public.fill_organization_id()` e as funções de RLS
já existentes (`is_org_member`, `is_org_admin`, `is_super_admin`). Nenhuma emissão real.

## Tabelas novas

- `fiscal_settings` — configuração fiscal por empresa (1 linha por empresa). Só o que não existe
  em `organizations`: inscrição municipal, código IBGE do município, regime tributário, Simples,
  ambiente, série da DPS, próximo número, referência do certificado (o segredo fica no cofre).
- `fiscal_service_codes` — cadastro fiscal de serviços: código da LC 116 / código municipal,
  CNAE, alíquota ISS, retenções padrão, ligado opcionalmente à linha de serviço já existente.
- `fiscal_documents` — entidade central: DPS e depois a NFS-e. Chaves fiscais como texto livre.
- `fiscal_document_finances` — relacionamento N:N com `finances`. Uma nota pode cobrir vários
  títulos; nenhum contas a receber é criado ou duplicado.
- `fiscal_document_items` — itens/serviços da nota.
- `fiscal_events` — auditoria de envio/retorno (insert + select apenas).

Enums: `fiscal_environment` (`homologacao`, `producao`) e `fiscal_document_status`
(`rascunho`, `pendente`, `processando`, `autorizada`, `rejeitada`, `cancelada`, `erro`).

PDF e XML são referências de storage privado (`bucket` + `path`), nunca URL pública.

## Migration proposta — `supabase/migrations-org/07_fiscal.sql`

```sql
-- ETAPA 7 — Estrutura fiscal (NFS-e padrão nacional / SEFIN DPS).
-- Apenas cria. Não altera, não renomeia e não apaga nada existente. Reexecutável.

-- ---------- enums ----------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'fiscal_environment') then
    create type public.fiscal_environment as enum ('homologacao','producao');
  end if;
  if not exists (select 1 from pg_type where typname = 'fiscal_document_status') then
    create type public.fiscal_document_status as enum
      ('rascunho','pendente','processando','autorizada','rejeitada','cancelada','erro');
  end if;
end $$;

-- ---------- fiscal_settings ----------
create table if not exists public.fiscal_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ambiente public.fiscal_environment not null default 'homologacao',
  inscricao_municipal text,
  codigo_municipio text,                 -- IBGE, texto (mantém zeros à esquerda)
  regime_tributario text,
  optante_simples boolean not null default false,
  incentivo_fiscal boolean not null default false,
  serie_dps text,
  proximo_numero_dps bigint not null default 1,
  certificado_ref text,                  -- referência ao segredo, nunca o certificado
  certificado_validade date,
  email_envio text,
  observacoes_padrao text,
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists fiscal_settings_org_key
  on public.fiscal_settings (organization_id);

-- ---------- fiscal_service_codes ----------
create table if not exists public.fiscal_service_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  servico_id uuid references public.servicos(id) on delete set null,
  descricao text not null,
  codigo_tributacao_nacional text,       -- LC 116 / tabela nacional
  codigo_tributacao_municipal text,
  cnae text,
  aliquota_iss numeric(7,4),
  iss_retido boolean not null default false,
  retencao_ir numeric(7,4),
  retencao_pis numeric(7,4),
  retencao_cofins numeric(7,4),
  retencao_csll numeric(7,4),
  retencao_inss numeric(7,4),
  tributacao_municipio text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fiscal_service_codes_org_idx
  on public.fiscal_service_codes (organization_id, ativo);
create index if not exists fiscal_service_codes_servico_idx
  on public.fiscal_service_codes (servico_id);

-- ---------- fiscal_documents ----------
create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  status public.fiscal_document_status not null default 'rascunho',
  ambiente public.fiscal_environment not null default 'homologacao',

  -- DPS
  dps_id text,                           -- identificador da DPS, texto conforme layout oficial
  dps_serie text,
  dps_numero text,
  competencia text,                      -- 'AAAA-MM', igual ao financeiro
  data_emissao timestamptz,

  -- valores
  valor_servicos numeric(14,2) not null default 0,
  valor_deducoes numeric(14,2) not null default 0,
  base_calculo numeric(14,2) not null default 0,
  aliquota_iss numeric(7,4),
  valor_iss numeric(14,2) not null default 0,
  iss_retido boolean not null default false,
  valor_retencoes numeric(14,2) not null default 0,
  valor_liquido numeric(14,2) not null default 0,

  -- retorno da NFS-e
  nfse_numero text,
  nfse_chave_acesso text,
  nfse_codigo_verificacao text,
  protocolo text,
  data_autorizacao timestamptz,
  motivo_rejeicao text,
  cancelado_em timestamptz,
  motivo_cancelamento text,

  -- arquivos em storage privado (sem URL pública)
  pdf_bucket text,
  pdf_path text,
  xml_bucket text,
  xml_path text,

  descricao_servico text,
  observacoes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fiscal_documents_org_status_idx
  on public.fiscal_documents (organization_id, status, created_at desc);
create index if not exists fiscal_documents_client_idx on public.fiscal_documents (client_id);
create index if not exists fiscal_documents_project_idx on public.fiscal_documents (project_id);
create unique index if not exists fiscal_documents_dps_key
  on public.fiscal_documents (organization_id, dps_id) where dps_id is not null;
create unique index if not exists fiscal_documents_serie_numero_key
  on public.fiscal_documents (organization_id, dps_serie, dps_numero)
  where dps_serie is not null and dps_numero is not null;

-- ---------- fiscal_document_finances (N:N com os títulos existentes) ----------
create table if not exists public.fiscal_document_finances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fiscal_document_id uuid not null references public.fiscal_documents(id) on delete cascade,
  finance_id uuid not null references public.finances(id) on delete restrict,
  valor_alocado numeric(14,2),
  created_at timestamptz not null default now(),
  unique (fiscal_document_id, finance_id)
);
create index if not exists fdf_finance_idx on public.fiscal_document_finances (finance_id);
create index if not exists fdf_org_idx on public.fiscal_document_finances (organization_id);

-- ---------- fiscal_document_items ----------
create table if not exists public.fiscal_document_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fiscal_document_id uuid not null references public.fiscal_documents(id) on delete cascade,
  fiscal_service_code_id uuid references public.fiscal_service_codes(id) on delete set null,
  descricao text not null,
  quantidade numeric(14,4) not null default 1,
  valor_unitario numeric(14,2) not null default 0,
  valor_total numeric(14,2) not null default 0,
  aliquota_iss numeric(7,4),
  valor_iss numeric(14,2) not null default 0,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists fdi_doc_idx on public.fiscal_document_items (fiscal_document_id, ordem);

-- ---------- fiscal_events (auditoria) ----------
create table if not exists public.fiscal_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fiscal_document_id uuid not null references public.fiscal_documents(id) on delete cascade,
  tipo text not null,                    -- criado | enviado | retorno | cancelado | erro
  status public.fiscal_document_status,
  mensagem text,
  request_payload jsonb,
  response_payload jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists fiscal_events_doc_idx
  on public.fiscal_events (fiscal_document_id, created_at desc);

-- ---------- gatilho de organização (mesma função das demais tabelas) ----------
do $$
declare t text;
  tables text[] := array['fiscal_settings','fiscal_service_codes','fiscal_documents',
                         'fiscal_document_finances','fiscal_document_items','fiscal_events'];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_fill_org on public.%I', t);
    execute format('create trigger trg_fill_org before insert on public.%I
      for each row execute function public.fill_organization_id()', t);
  end loop;
end $$;

-- ---------- grants + RLS no padrão "org ..." ----------
do $$
declare t text;
  tables text[] := array['fiscal_settings','fiscal_service_codes','fiscal_documents',
                         'fiscal_document_finances','fiscal_document_items'];
begin
  foreach t in array tables loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);

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

-- configuração fiscal e cadastro fiscal de serviços: escrita só para admin da empresa
drop policy if exists "org insert fiscal_settings" on public.fiscal_settings;
create policy "org insert fiscal_settings" on public.fiscal_settings for insert to authenticated
  with check (organization_id is not null and public.is_org_admin(organization_id));
drop policy if exists "org update fiscal_settings" on public.fiscal_settings;
create policy "org update fiscal_settings" on public.fiscal_settings for update to authenticated
  using (organization_id is not null and public.is_org_admin(organization_id))
  with check (organization_id is not null and public.is_org_admin(organization_id));
drop policy if exists "org delete fiscal_settings" on public.fiscal_settings;
create policy "org delete fiscal_settings" on public.fiscal_settings for delete to authenticated
  using (organization_id is not null and public.is_org_admin(organization_id));

-- fiscal_events: auditoria imutável (sem update/delete)
grant select, insert on public.fiscal_events to authenticated;
grant all on public.fiscal_events to service_role;
alter table public.fiscal_events enable row level security;
drop policy if exists "org select fiscal_events" on public.fiscal_events;
create policy "org select fiscal_events" on public.fiscal_events for select to authenticated
  using (organization_id is not null and public.is_org_member(organization_id));
drop policy if exists "org insert fiscal_events" on public.fiscal_events;
create policy "org insert fiscal_events" on public.fiscal_events for insert to authenticated
  with check (organization_id is not null and public.is_org_member(organization_id));

-- ---------- storage privado dos arquivos fiscais ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('fiscal-files', 'fiscal-files', false, 26214400)
on conflict (id) do nothing;

-- caminho: {organization_id}/{fiscal_document_id}/arquivo.(pdf|xml)
drop policy if exists "fiscal files read" on storage.objects;
create policy "fiscal files read" on storage.objects for select to authenticated
  using (bucket_id = 'fiscal-files' and public.is_org_member((storage.foldername(name))[1]::uuid));
drop policy if exists "fiscal files write" on storage.objects;
create policy "fiscal files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'fiscal-files' and public.is_org_member((storage.foldername(name))[1]::uuid));

-- ---------- verificação ----------
select tablename, count(*) filter (where policyname like 'org %') as policies_org
from pg_policies
where schemaname = 'public' and tablename like 'fiscal%'
group by tablename order by tablename;
```

## Fora desta etapa

Nenhuma emissão, nenhum XML, nenhum certificado no banco, nenhuma alteração em
`finances`/`baixas`/`clients`/`projects`/`servicos` e nenhuma tela nova.

Ao aprovar, eu crio o arquivo `supabase/migrations-org/07_fiscal.sql` com exatamente este
conteúdo. A execução no Supabase continua manual, feita por você.
