# Redesign — Project Command Center

Transformar `projetos/$id` em um painel executivo único (estilo Linear / Notion / ClickUp), substituindo o layout atual baseado em abas por uma página de rolagem vertical com sidebar fixa de contexto à direita.

## Estrutura nova (ordem em tela)

1. **Header Executivo** — nome, cliente, status, responsável, datas, progresso %, dias restantes, **HealthBadge** (🟢/🟡/🔴) calculado no backend (já existe em `getProjectDashboard`).
2. **Barra de Alertas Inteligentes** — chips coloridos com ícone (atrasadas, orçamento, prazo, aprovação cliente, próximo marco). Reusa `dashboard.alerts` + deriva "aguardando cliente" e "próximo marco".
3. **KPIs em linha** — Progresso, Tarefas (done/total), Receita, Custos, Lucro, Margem, Equipe, Riscos abertos.
4. **Central de Execução** — três colunas:
   - **Fazer Hoje** (tasks com `due_date = hoje`)
   - **Atrasadas** (tasks vencidas, com dias de atraso)
   - **Aguardando Cliente** (tasks com label/status "aguardando_cliente" — derivar do status do projeto + flag em task; ver pergunta abaixo)
5. **Evolução do Projeto** — `LineChart` Planejado × Realizado por semana (planejado linear do start→due; realizado = tarefas concluídas acumuladas).
6. **Roadmap Visual** — timeline horizontal com nós (✓ done, ◉ in_progress, ○ pending), criar/editar/concluir marco inline.
7. **Resumo Financeiro** — cards Contrato/Recebido/Custos/Lucro/Margem + mini sparkline mensal.
8. **Próximas Entregas** — tarefas/marcos agrupados em 7/15/30 dias.
9. **Kanban Compacto** — contadores por coluna, clique → `/tarefas?project=<id>`.
10. **Feed de Atividades** — `project_activity` em formato timeline com avatar/nome/ação/tempo relativo.
11. **Sidebar fixa de contexto** (direita, desktop) — projeto, status, responsável, prazo, equipe, risco, próximo marco, próxima entrega.

Abas atuais (Tarefas, Marcos, Equipe, Riscos, Custos, Financeiro, Arquivos, Atividade, Notas) viram **acordeões/seções secundárias** no fim da página ou ficam acessíveis via botões "Ver tudo" em cada bloco. Nada é removido — apenas reorganizado.

## Mudanças técnicas

### Backend (`src/lib/projects/projects.functions.ts`)
Estender `getProjectDashboard` para retornar:
- `execution`: `{ today: Task[], overdue: Task[], waitingClient: Task[] }`
- `plannedVsActual`: `{ week: string, planned: number, actual: number }[]` (12 semanas)
- `upcomingDeliveries`: `{ in7: [], in15: [], in30: [] }` (tarefas + marcos com due_date)
- `kanbanCounts`: `Record<status, number>`
- `financeMonthly`: `{ month, revenue, cost }[]` (últimos 6 meses, para sparkline)
- `nextMilestone`: próximo `project_milestones` com status ≠ done

Sem mudança de schema — tudo derivado do que já existe.

### Frontend
Reescrever `src/routes/_authenticated/projetos.$id.tsx`. Quebrar em sub-componentes em `src/components/projects/command-center/`:
- `ExecutiveHeader.tsx`
- `AlertsBar.tsx`
- `KpiRow.tsx`
- `ExecutionPanel.tsx` (3 colunas)
- `PlannedVsActualChart.tsx`
- `RoadmapTimeline.tsx` (horizontal, com botões inline criar/editar/concluir reaproveitando `upsertMilestone`)
- `FinanceSummary.tsx`
- `UpcomingDeliveries.tsx`
- `KanbanCompact.tsx`
- `ActivityFeed.tsx`
- `ContextSidebar.tsx` (sticky, `lg:` only)

Layout: grid `lg:grid-cols-[1fr_320px]`, sidebar `sticky top-4`. Cards com `rounded-2xl`, bordas suaves, sem ruído visual.

## Não muda
- Schema do banco.
- Outras rotas (dashboard, tarefas, kanban global).
- Componentes de drawer/dialog existentes (`ProjectFormDialog`, `TaskDrawer`) — reusados.

## Perguntas antes de implementar
1. "Aguardando Cliente" na coluna 3 da Central de Execução — devo usar tasks cujo **projeto** está `aguardando_cliente`, ou criar um campo/label específico por tarefa? (sugestão: derivar de `tasks.status = 'em_revisao'` + projeto em qualquer status — é o sinal mais próximo hoje, sem mudar schema).
2. As **abas atuais** (Equipe, Riscos, Custos, Notas, Arquivos completos) devem virar acordeões no fim da mesma página, ou ficarem em rotas filhas (`/projetos/$id/equipe`)? (sugestão: acordeões — mantém tudo numa tela só, fiel ao briefing).
