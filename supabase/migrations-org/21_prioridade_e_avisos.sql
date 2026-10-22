-- 21 — Prioridade nos agendamentos de lead e confirmações "CIENTE" (22/10/2026)
-- 1) lead_tasks.priority: mesmo tipo das tarefas gerais (baixa, media, alta, critica).
--    Registros atuais ficam como 'media'. "critica" aparece na tela como "Urgente".
-- 2) task_priority_acks: guarda quem confirmou (CIENTE) o aviso de cada tarefa
--    prioritária. Cada pessoa só lê e grava as próprias confirmações, dentro das
--    empresas de que participa.
-- Só acrescenta itens novos: nada é apagado e nenhuma regra existente muda.
-- Pode rodar mais de uma vez.

begin;

alter table public.lead_tasks
  add column if not exists priority public.task_priority not null default 'media';

create index if not exists lead_tasks_priority_open_idx
  on public.lead_tasks (owner_id, priority) where done = false;

create table if not exists public.task_priority_acks (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('task', 'lead')),
  item_id uuid not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (user_id, source, item_id)
);

alter table public.task_priority_acks enable row level security;

drop policy if exists "priority acks: own read" on public.task_priority_acks;
create policy "priority acks: own read" on public.task_priority_acks
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "priority acks: own insert" on public.task_priority_acks;
create policy "priority acks: own insert" on public.task_priority_acks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (organization_id is null or public.is_org_member(organization_id))
  );

drop policy if exists "priority acks: own update" on public.task_priority_acks;
create policy "priority acks: own update" on public.task_priority_acks
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (organization_id is null or public.is_org_member(organization_id))
  );

drop policy if exists "priority acks: own delete" on public.task_priority_acks;
create policy "priority acks: own delete" on public.task_priority_acks
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.task_priority_acks to authenticated;
revoke all on public.task_priority_acks from anon;

commit;

-- Verificação: deve retornar 1 linha com priority e 1 linha com a tabela.
select 'lead_tasks.priority' as item, count(*) as ok
  from information_schema.columns
 where table_schema = 'public' and table_name = 'lead_tasks' and column_name = 'priority'
union all
select 'task_priority_acks', count(*)
  from information_schema.tables
 where table_schema = 'public' and table_name = 'task_priority_acks';
