
# Project Command Center

Hub único para gerenciar todo um projeto sem trocar de tela. Visual premium SaaS (fundo claro, `rounded-2xl`, espaçamento amplo, sombras suaves, tipografia limpa).

## 1. Estrutura de rotas

- `/projetos` → **lista** de projetos (cards/tabela com status, progresso, cliente, prazo, saúde). Botão "Novo projeto".
- `/projetos/$id` → **Command Center** do projeto (página única, scroll vertical, 15 seções).

Arquivos:
- `src/routes/_authenticated/projetos.index.tsx` (lista)
- `src/routes/_authenticated/projetos.$id.tsx` (command center)
- Substitui o placeholder atual `projetos.tsx`.

## 2. Banco de dados (novas tabelas)

Migrations com RLS `auth.uid() = owner_id`, GRANTs para `authenticated`/`service_role`, triggers `updated_at`.

```text
projects                (existente — adicionar: manager_id, health_cache, contract_value)
project_milestones      (project_id, title, status, due_date, order)
project_members         (project_id, user_id, role)
project_risks           (project_id, title, description, severity, status, assignee_id)
project_notes           (project_id, content_html, updated_at)  -- 1:1 autosave
project_costs           (project_id, kind[internal|external], category, description, amount, incurred_at)
project_activity        (project_id, actor_id, action, entity, meta jsonb, created_at)
```

Reutiliza: `tasks` (já tem `project_id`), `files` (já tem `project_id`), `finances` (vincula via `client_id` + novo `project_id` opcional).

## 3. Server functions

`src/lib/projects/projects.functions.ts`:
- `listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`
- `getProjectDashboard(id)` → retorna em um único payload: projeto, KPIs, alertas, tarefas do dia, semana, milestones, financeiro, custos, equipe, riscos, atividade recente
- CRUDs para milestones, members, risks, notes (autosave debounced), costs

Cálculos no servidor: progresso (tasks concluídas/total), saúde (regras: atrasos, budget>80%, prazo<7d, riscos críticos), lucro, margem, dias restantes.

## 4. Layout do Command Center (`/projetos/$id`)

Página única, grid responsivo. Ordem das seções:

```text
┌─ Header: nome, cliente, manager, datas, status badge, progresso, saúde 🟢🟡🔴
├─ Alertas inteligentes (banner condicional)
├─ KPI cards (6): progresso | receita | custo | lucro | dias restantes | issues
├─ Tabs principais: [Visão Geral] [Tarefas] [Financeiro] [Equipe] [Arquivos] [Notas] [Atividade]
│
│  Visão Geral:
│   • Foco do dia (tarefas due today + quick actions)
│   • Performance semanal (concluídas/atrasadas/novas + produtividade por membro - Recharts)
│   • Overview mensal (4 charts: progresso, tasks, budget area, horas)
│   • Roadmap de milestones (timeline com check/edit/add)
│   • Riscos & blockers (críticos destacados)
│
│  Tarefas: Kanban + Lista embutidos (reaproveita componentes de /tarefas filtrados por project_id)
│  Financeiro: contract value, recebido, pendente, custo, lucro, margem + cost breakdown
│  Equipe: avatares, role, tarefas ativas, add/remove
│  Arquivos: upload Supabase Storage por categoria (contratos/briefings/designs/docs/relatórios)
│  Notas: RichTextEditor com autosave (debounce 1s)
│  Atividade: feed cronológico
```

Mobile: tabs viram dropdown, KPIs em 2 colunas, charts full-width.

## 5. Componentes a criar

```text
src/components/projects/
  ProjectHeader.tsx
  ProjectAlerts.tsx
  KpiCard.tsx                    (reutilizável)
  HealthBadge.tsx
  TodayFocus.tsx
  WeeklyPerformance.tsx
  MonthlyOverview.tsx            (Recharts)
  MilestonesRoadmap.tsx
  ProjectTasksTab.tsx            (Kanban + Lista filtrados)
  FinancialOverview.tsx
  CostManagement.tsx
  TeamPanel.tsx
  NotesEditor.tsx                (usa RichTextEditor existente + autosave)
  FilesPanel.tsx
  RisksPanel.tsx
  ActivityFeed.tsx
  ProjectFormDialog.tsx          (criar/editar projeto)
  ProjectListCard.tsx
```

## 6. Cálculos automáticos (helpers)

```text
src/lib/projects/calc.ts
  computeProgress(tasks)
  computeFinancials(finances, costs, contractValue)
  computeHealth({ progress, overdue, budgetUsage, daysToDue, openCriticalRisks })
```

## 7. Storage

Reutiliza bucket existente para anexos; cria pasta lógica `projects/{project_id}/{categoria}/`. Se faltar bucket público para preview de arquivos, criamos `project-files` privado com signed URLs.

## 8. Integração com módulos existentes

- Tarefas: filtro `project_id=$id`, mesmo TaskDrawer.
- Financeiro: adiciona `project_id` opcional em `finances` (migration) para vincular receitas/despesas ao projeto.
- Google Sheets sync (já existente): aproveita hook para futuras sincronizações; fora do escopo desta entrega.

## 9. Entregáveis desta fase

1. Migrations (tabelas + colunas novas em `projects`/`finances`)
2. Server functions completas
3. Página de lista `/projetos`
4. Página `/projetos/$id` com todas as 15 seções funcionais
5. Componentes listados acima
6. Atualização do menu lateral (link já existe)

## 10. Observações técnicas

- Loader usa `ensureQueryData(getProjectDashboard)` + `useSuspenseQuery`.
- Atividade alimentada via triggers de banco em tasks/finances/files (similar ao `tg_tasks_history` atual).
- Saúde recalculada on-demand no `getProjectDashboard` (não persistida).
- Notas: única linha por projeto, upsert no autosave.

Após aprovação, executo migrations primeiro, depois server functions e UI.
