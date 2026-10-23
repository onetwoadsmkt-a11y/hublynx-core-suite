-- 22 — Conclusão de tarefas, data de entrada na etapa, modelos de e-mail e
--      automações do Kanban (22/10/2026)
-- Só acrescenta itens novos: nada é apagado e nenhuma regra existente muda.
-- Pode rodar mais de uma vez.

begin;

-- ───────────── 1) Tarefa concluída registra a data de conclusão ─────────────
-- Ao mudar o status para concluído, grava completed_at; ao reabrir, limpa.
create or replace function public.tg_task_completed_at()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status = 'concluido' and (tg_op = 'INSERT' or old.status is distinct from 'concluido') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status is distinct from 'concluido' and tg_op = 'UPDATE' and old.status = 'concluido' then
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_completed_at on public.tasks;
create trigger tasks_completed_at before insert or update of status on public.tasks
  for each row execute function public.tg_task_completed_at();

-- Tarefas já concluídas sem data de conclusão: usa a última atualização.
update public.tasks set completed_at = updated_at
 where status = 'concluido' and completed_at is null;

-- ───────────── 2) Data de entrada do lead na etapa atual ─────────────
-- Base das automações por tempo ("10 dias após a entrada na etapa").
alter table public.leads add column if not exists stage_entered_at timestamptz;
update public.leads set stage_entered_at = coalesce(updated_at, created_at) where stage_entered_at is null;
alter table public.leads alter column stage_entered_at set default now();

create or replace function public.tg_lead_stage_entered()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    new.stage_entered_at := coalesce(new.stage_entered_at, now());
  elsif new.stage_id is distinct from old.stage_id then
    new.stage_entered_at := now();
  end if;
  return new;
end $$;

drop trigger if exists leads_stage_entered on public.leads;
create trigger leads_stage_entered before insert or update of stage_id on public.leads
  for each row execute function public.tg_lead_stage_entered();

create index if not exists leads_stage_entered_idx on public.leads (stage_id, stage_entered_at);

-- ───────────── 3) Modelos de e-mail ─────────────
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 120),
  subject text not null check (char_length(subject) between 1 and 300),
  body text not null default '' check (char_length(body) <= 200000), -- texto ou HTML
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_templates enable row level security;
drop policy if exists "email templates: org" on public.email_templates;
create policy "email templates: org" on public.email_templates
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
grant select, insert, update, delete on public.email_templates to authenticated;
revoke all on public.email_templates from anon;

-- ───────────── 4) Automações do Kanban ─────────────
-- trigger:    {"type":"on_enter"} | {"type":"after_time","minutes":14400} |
--             {"type":"on_enter_with_tag","tag":"x"} | {"type":"on_tag_added","tag":"x"}
-- conditions: [{"field":"tags_any","value":["x"]}, {"field":"temperature","value":["quente"]}, ...]
-- actions:    [{"type":"move_stage","stage_id":"…"}, {"type":"add_tag","tag":"y"},
--              {"type":"send_email","template_id":"…"}, {"type":"create_task",…}, …]
create table if not exists public.pipeline_automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  active boolean not null default true,
  trigger jsonb not null default '{"type":"on_enter"}'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pipeline_automations_stage_idx on public.pipeline_automations (stage_id) where active;
alter table public.pipeline_automations enable row level security;
drop policy if exists "pipeline automations: org" on public.pipeline_automations;
create policy "pipeline automations: org" on public.pipeline_automations
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
grant select, insert, update, delete on public.pipeline_automations to authenticated;
revoke all on public.pipeline_automations from anon;

-- Execuções: a chave única impede repetir a mesma automação para o mesmo lead na
-- mesma passagem pela etapa (entrar de novo na etapa = nova passagem).
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.pipeline_automations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  run_key text not null,
  status text not null default 'running' check (status in ('running', 'ok', 'skipped', 'error')),
  detail text,
  created_at timestamptz not null default now(),
  unique (automation_id, lead_id, run_key)
);
create index if not exists automation_runs_recent_idx on public.automation_runs (organization_id, created_at desc);
alter table public.automation_runs enable row level security;
drop policy if exists "automation runs: org" on public.automation_runs;
create policy "automation runs: org" on public.automation_runs
  for all to authenticated
  using (organization_id is null or public.is_org_member(organization_id))
  with check (organization_id is null or public.is_org_member(organization_id));
grant select, insert, update on public.automation_runs to authenticated;
revoke all on public.automation_runs from anon;

commit;

-- Verificação: as quatro linhas devem vir com ok = 1.
select 'leads.stage_entered_at' as item, count(*) as ok from information_schema.columns
 where table_schema = 'public' and table_name = 'leads' and column_name = 'stage_entered_at'
union all select 'email_templates', count(*) from information_schema.tables where table_schema = 'public' and table_name = 'email_templates'
union all select 'pipeline_automations', count(*) from information_schema.tables where table_schema = 'public' and table_name = 'pipeline_automations'
union all select 'automation_runs', count(*) from information_schema.tables where table_schema = 'public' and table_name = 'automation_runs';

-- Opcional (automações por tempo sem ninguém com o sistema aberto): agendar a
-- verificação a cada 15 min. Troque <SEU-DOMINIO> e <SEGREDO> (o mesmo valor da
-- variável AUTOMATIONS_CRON_SECRET no Lovable) e rode separadamente:
-- select cron.schedule('core-automacoes', '*/15 * * * *', $$
--   select net.http_post(
--     url := 'https://<SEU-DOMINIO>/api/public/hooks/run-automations',
--     headers := '{"Content-Type":"application/json","x-cron-secret":"<SEGREDO>"}'::jsonb,
--     body := '{}'::jsonb);
-- $$);
