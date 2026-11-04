-- 37 · Lembretes no celular também para os agendamentos de lead
-- Registro de "já avisei" por agendamento, pessoa e tipo (em breve / atrasado),
-- para o lembrete não repetir. Só o servidor (service_role) grava e lê.
-- Não altera nem apaga dados existentes.

create table if not exists public.lead_task_push_log (
  id uuid primary key default gen_random_uuid(),
  lead_task_id uuid not null references public.lead_tasks(id) on delete cascade,
  user_id uuid not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  unique (lead_task_id, user_id, kind)
);
create index if not exists lead_task_push_log_task_idx on public.lead_task_push_log (lead_task_id);

alter table public.lead_task_push_log enable row level security;
revoke all on public.lead_task_push_log from anon, authenticated;
grant all on public.lead_task_push_log to service_role;

-- Verificação: deve mostrar a tabela com RLS ligada
select c.relname as tabela, c.relrowsecurity as rls_ligada
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'lead_task_push_log';
