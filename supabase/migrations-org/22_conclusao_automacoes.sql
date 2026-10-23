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

commit;
