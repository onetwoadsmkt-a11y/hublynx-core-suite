-- 10 — Formulários de captação por empresa (10/10/2026)
--
-- Traz o construtor do Lead Pro para dentro do Core Suite. Cada empresa
-- (organização) tem os próprios formulários; o envio cria o lead direto no
-- pipeline, já com pontuação e classificação.
--
-- Somente criações: nenhuma tabela existente é alterada. As tabelas antigas
-- "forms", "form_questions", "form_options", "form_submissions" e
-- "form_answers" (rascunho abandonado de agosto) continuam intactas e sem uso.
-- O Lead Pro externo (form.hublynx.com.br, usado pela ValeSafe) não é tocado.
--
-- Pré-requisitos já existentes: public.organizations, public.is_org_member(),
-- public.leads (com lead_score e lead_classification), public.pipelines,
-- public.pipeline_stages e o bucket de arquivos "org-files".

begin;

-- ---------- formulários ----------
create table if not exists public.lead_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null,
  -- id curto usado no link público: /f/{public_id}-{slug}
  public_id text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  mode text not null default 'scoring' check (mode in ('scoring', 'direct')),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  -- rascunho completo do editor (campos, faixas, regras, aparência, telas finais)
  draft jsonb not null default '{}'::jsonb,
  active_version_id uuid,
  -- destino no CRM
  pipeline_id uuid references public.pipelines(id) on delete set null,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  default_source text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.lead_form_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  form_id uuid not null references public.lead_forms(id) on delete cascade,
  version int not null,
  definition jsonb not null,
  published_by uuid,
  published_at timestamptz not null default now(),
  unique (form_id, version)
);

alter table public.lead_forms
  drop constraint if exists lead_forms_active_version_fk;
alter table public.lead_forms
  add constraint lead_forms_active_version_fk
  foreign key (active_version_id) references public.lead_form_versions(id) on delete set null;

-- ---------- respostas ----------
create table if not exists public.lead_form_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  form_id uuid not null references public.lead_forms(id) on delete cascade,
  version_id uuid references public.lead_form_versions(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  state text not null default 'completed' check (state in ('completed', 'terminated')),
  answers jsonb not null default '{}'::jsonb,
  score_total numeric,
  classification_key text,
  classification_label text,
  tags text[] not null default '{}',
  utm jsonb not null default '{}'::jsonb,
  origin jsonb not null default '{}'::jsonb,
  consent jsonb not null default '{}'::jsonb,
  evaluation jsonb not null default '{}'::jsonb,
  client_hash text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (form_id, idempotency_key)
);

create index if not exists idx_lead_forms_org on public.lead_forms (organization_id, created_at desc);
create index if not exists idx_lead_form_versions_form on public.lead_form_versions (form_id, version desc);
create index if not exists idx_lead_form_subs_form on public.lead_form_submissions (form_id, created_at desc);
create index if not exists idx_lead_form_subs_rate on public.lead_form_submissions (form_id, client_hash, created_at desc);

-- updated_at automático
create or replace function public.lead_forms_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_lead_forms_touch on public.lead_forms;
create trigger trg_lead_forms_touch before update on public.lead_forms
  for each row execute function public.lead_forms_touch();

-- ---------- RLS: só membros da empresa enxergam ----------
-- O app grava pelo servidor (service role) depois de validar a empresa;
-- as políticas abaixo protegem qualquer acesso direto pelo navegador.
alter table public.lead_forms enable row level security;
alter table public.lead_form_versions enable row level security;
alter table public.lead_form_submissions enable row level security;

drop policy if exists lead_forms_member_all on public.lead_forms;
create policy lead_forms_member_all on public.lead_forms for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists lead_form_versions_member_read on public.lead_form_versions;
create policy lead_form_versions_member_read on public.lead_form_versions for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists lead_form_subs_member_read on public.lead_form_submissions;
create policy lead_form_subs_member_read on public.lead_form_submissions for select to authenticated
  using (public.is_org_member(organization_id));

grant select, insert, update, delete on public.lead_forms to authenticated;
grant select on public.lead_form_versions, public.lead_form_submissions to authenticated;
grant all on public.lead_forms, public.lead_form_versions, public.lead_form_submissions to service_role;

commit;

-- Conferência (deve listar as 3 tabelas):
-- select table_name from information_schema.tables
-- where table_schema = 'public' and table_name like 'lead_form%' order by 1;
