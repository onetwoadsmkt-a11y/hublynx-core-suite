# Integração Tarefas ↔ Roadmap do projeto

## Objetivo
Quando uma tarefa pertencer a um projeto, ela vira automaticamente um item do roadmap desse projeto. No card da tarefa (Kanban) o usuário poderá editar e atualizar o status que reflete no roadmap.

## Modelo de dados
- Adicionar coluna `milestone_id uuid` em `tasks` (FK → `project_milestones.id ON DELETE SET NULL`), índice por `milestone_id`.
- Manter `project_milestones` como hoje (marcos manuais ainda funcionam).
- O roadmap do projeto passa a exibir **duas fontes**: marcos manuais + tarefas do projeto, ordenadas por `due_date`/criação.

Mapeamento status tarefa → status no roadmap:
- `concluido` → done
- `em_andamento` / `em_revisao` → in_progress
- demais → pending

## Backend (`src/lib/projects/projects.functions.ts`)
- `getProjectDashboard`: ao montar a resposta, devolver também `roadmap` = união de `milestones` + `tasks` do projeto, com shape comum `{ kind: "milestone" | "task", id, title, description, status, due_date, source }`.
- Novo serverFn `updateTaskFromRoadmap({ id, status, title?, description?, due_date? })` que atualiza `tasks` respeitando RLS (usa `requireSupabaseAuth`).

## UI

### Página do projeto (`projetos.$id.tsx` → `MilestonesSection`)
- Renderizar o `roadmap` combinado. Itens do tipo `task` ganham badge "Tarefa" e link para abrir a `TaskDrawer`.
- Botões: marcar concluído (alterna status da tarefa/marco), editar (abre dialog adequado), excluir só para marcos manuais.

### Kanban de tarefas (`tarefas.tsx` → `TaskCard`)
- Adicionar botão **lápis (Editar)** no canto do card que abre a `TaskDrawer` já existente.
- Adicionar **menu rápido de status** (dropdown) no card para mover a tarefa entre `a_fazer / em_andamento / em_revisao / concluido` sem precisar arrastar — isso atualiza o status que aparece no roadmap.
- Quando a tarefa tem `project_id`, exibir chip "Roadmap • {nome do projeto}" no card.

### TaskDrawer
- Já tem edição. Garantir que após salvar, invalida tanto `["tasks"]` quanto `["project-dashboard", project_id]` para o roadmap refletir imediato.

## Arquivos
- `supabase/migrations/<ts>_tasks_milestone_link.sql` — coluna + índice + GRANT já existentes.
- `src/lib/projects/projects.functions.ts` — incluir tarefas no payload + nova mutation.
- `src/routes/_authenticated/projetos.$id.tsx` — `MilestonesSection` renderiza roadmap combinado.
- `src/routes/_authenticated/tarefas.tsx` — botão editar + dropdown de status no `TaskCard`, invalidations cruzadas.

## Perguntas rápidas
1. Quero confirmar: toda tarefa de um projeto deve aparecer no roadmap automaticamente, ou só as marcadas com uma flag (ex.: "marco")?
2. O card no Kanban deve mostrar o nome do projeto/roadmap a que pertence?
