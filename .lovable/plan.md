
# Etapa 1 — Tarefas

Escopo desta etapa: apenas o módulo **Tarefas**. Financeiro, Clientes e Projetos ficam para etapas seguintes (mesma abordagem, um por vez).

## 1. Novo formulário "Nova Tarefa / Reunião"

Substituir o `NewTaskDialog` (desktop) e o `NewTaskSheet` (mobile) por um único componente compartilhado `TaskQuickForm` — sempre em `Sheet` bottom no mobile, `Dialog` no desktop — com os campos mínimos:

- **Tipo** (toggle no topo): `Tarefa` | `Reunião`
- **Título** (obrigatório)
- **Data da tarefa** (data + hora opcional) — quando `Reunião`, hora é obrigatória
- **Prazo** (data, opcional) — só aparece para `Tarefa`
- **Checklist** — lista editável inline (add/remove/reorder), gravada em `task_checklists` após criar
- **Cliente / Projeto** (opcionais, colapsados em "Mais opções")
- **Prioridade** (default: Média, dentro de "Mais opções")
- **Descrição** (dentro de "Mais opções")

Comportamento:
- `Reunião` → cria a tarefa com `briefing.type = "reuniao"` e dispara automaticamente `syncTaskToCalendar({ withMeet: true })` (mesma função já usada hoje) para criar evento + link Meet no Google Calendar.
- `Tarefa` com data preenchida → sincroniza com Calendar sem Meet.
- Checklist: após inserir a tarefa, faz insert em lote em `task_checklists` respeitando `position`.

Campos removidos do form rápido (continuam disponíveis no `TaskDrawer` já existente): status inicial, horas estimadas, tempo gasto, custos, briefing longo, anexos.

## 2. Visualizações: Kanban, Lista, Calendário

Na rota `/tarefas` (`src/routes/_authenticated/tarefas.tsx`), transformar as `Tabs` atuais em três abas persistidas na URL via `validateSearch` (`?view=kanban|lista|calendario`):

- **Kanban** — mantém a implementação atual (dnd-kit, colunas customizáveis).
- **Lista** — mantém tabela atual; adicionar coluna "Data" (data da tarefa) além do "Prazo" existente e ícone diferenciando Tarefa/Reunião.
- **Calendário** (novo) — grade mensal simples reutilizando a lógica de `src/lib/agenda/agenda.functions.ts` (`getAgendaEvents`), filtrada para `source ∈ {task, meeting}`. Clique num dia abre `TaskQuickForm` pré-preenchido; clique num evento abre `TaskDrawer`.

Não vamos criar dependência nova de calendário — implementar grade mensal com date-fns (já instalado) num componente `TaskCalendarView`.

## 3. Ajustes mobile

- Header da página `/tarefas`: virar `grid-cols-[minmax(0,1fr)_auto]` (padrão responsive-layout) com título encurtado e menu "⋯" agrupando "Editar Kanban" e "Abrir Central PWA" no mobile.
- Filtros: colapsar em um `Sheet` "Filtros" acionado por botão no mobile; no desktop mantém a barra inline.
- Kanban no mobile: manter scroll horizontal atual, mas reduzir largura da coluna para 280px e habilitar swipe (já funciona com o pan).
- Lista no mobile: converter cada linha em card empilhado (título + badges + data) quando `useIsMobile()`.
- Calendário no mobile: modo "agenda" (lista de dias com eventos) em vez de grade quando `useIsMobile()`.
- FAB "+" fixado no canto inferior direito no mobile abrindo `TaskQuickForm`.

## 4. Google Calendar

Sem mudanças de contrato: continua usando `syncTaskToCalendar` e `createInstantMeet` que já existem em `src/lib/google/calendar.functions.ts`. O novo form apenas chama `syncTaskToCalendar` automaticamente quando há data preenchida (hoje isso já acontece no `NewTaskSheet`, vamos padronizar em ambos os fluxos).

## 5. Arquivos afetados

Criar:
- `src/components/tasks/TaskQuickForm.tsx` — form unificado com abas Tarefa/Reunião + checklist inline.
- `src/components/tasks/TaskCalendarView.tsx` — grade mensal / lista agenda no mobile.
- `src/components/tasks/TaskListMobile.tsx` — cards empilhados para mobile.
- `src/components/tasks/TaskFiltersSheet.tsx` — sheet de filtros mobile.

Editar:
- `src/routes/_authenticated/tarefas.tsx` — trocar Tabs para 3 abas, integrar novo form, filtros em sheet no mobile, header responsivo, FAB.
- `src/components/app-mobile/NewActionSheet.tsx` e `src/routes/_authenticated/app.tarefas.tsx` — usar `TaskQuickForm` no lugar de `NewTaskSheet`.
- Remover `src/components/tasks/NewTaskSheet.tsx` (substituído).

Sem migração de banco: `task_checklists` já existe e suporta o fluxo.

## 6. Fora de escopo desta etapa

- Reestruturação de Financeiro, Clientes e Projetos (próximas etapas).
- Novas colunas em `tasks`.
- Recorrência de tarefas/reuniões.
