# Evolução do módulo de Projetos — Modelos Comerciais

Mantém toda a estrutura atual (Clientes, Projetos, Tarefas, Financeiro, Equipe, Arquivos). A mudança é **aditiva**: novos campos no projeto, comportamento financeiro derivado e uma nova aba **Comercial** dentro do projeto.

## 1. Schema (migration única)

Adições em `public.projects`:
- `service_type text` — `desenvolvimento | trafego_pago | gestao_conteudo | consultoria | design | suporte | outros`
- `commercial_model text not null default 'projeto_fechado'` — `projeto_fechado | mensal_recorrente | banco_horas | por_hora | suporte_continuo`
- `hourly_rate numeric(12,2)` — usado em `por_hora` e `banco_horas`
- `contracted_hours numeric(10,2)` — usado em `banco_horas`
- `monthly_value numeric(12,2)` — usado em `mensal_recorrente` e `suporte_continuo`
- `billing_day smallint` — dia do mês da cobrança recorrente (1–28)
- `next_billing_date date` — próxima cobrança calculada/manual

Adições em `public.tasks`:
- `time_spent_minutes integer not null default 0` — somatório real (mantém `actual_hours` legado, mas o novo campo é a fonte para faturamento)
- `internal_cost numeric(12,2)`
- `generated_value numeric(12,2)`
- `billable boolean not null default true`

Sem nova tabela: receitas/custos continuam em `finances` e `project_costs`. Cobranças recorrentes são geradas como registros em `finances` (type=receita, category=recorrente, project_id, due_date = próximo vencimento). Um job/manual cria os próximos meses.

Inclui GRANTs já existentes — apenas `ALTER TABLE ADD COLUMN`, sem mexer em policies.

## 2. Backend (`src/lib/projects/projects.functions.ts`)

- Estender `projectInput` (zod) e `upsertProject` com os novos campos + validação condicional por `commercial_model`.
- Estender `getProjectDashboard` retornando bloco `commercial`:
  - `model`, `serviceType`, `contractValue`, `monthlyValue`, `hourlyRate`
  - `revenue` (soma `finances` recebidas), `pending` (a receber), `costs`, `profit`, `margin`
  - `hoursWorked` (soma `tasks.time_spent_minutes/60` do projeto)
  - `hoursContracted`, `hoursRemaining` (banco de horas)
  - `monthsPaid`, `monthsPending`, `nextBilling` (recorrente)
  - `billableValue` (por hora: `hoursWorked * hourlyRate`)
- Nova fn `generateRecurringInvoice({ projectId })` — cria próximo `finances` pendente e avança `next_billing_date`.

## 3. Frontend

**`ProjectFormDialog.tsx`**: adicionar selects `Tipo de Serviço` e `Modelo Comercial`; campos extras aparecem condicionalmente:
- `projeto_fechado` → `contract_value`
- `mensal_recorrente` / `suporte_continuo` → `monthly_value`, `billing_day`
- `banco_horas` → `hourly_rate`, `contracted_hours`
- `por_hora` → `hourly_rate`

**Página do projeto (`projetos.$id.tsx`)**:
- Header: badge do modelo comercial ao lado do status.
- KPI Row: adicionar tiles dinâmicos conforme o modelo (Horas Trabalhadas, Horas Restantes, Próxima Cobrança, Receita Gerada). Os já existentes (Receita, Custos, Lucro, Margem) permanecem.
- Nova aba/acordeão **Comercial** (`src/components/projects/command-center/CommercialPanel.tsx`):
  - Cabeçalho com Tipo de Serviço, Modelo, Valor Contratado.
  - Bloco financeiro: Receita, Custos, Lucro, Margem.
  - Bloco específico do modelo:
    - Fechado: contratado / recebido / pendente.
    - Recorrente: próxima cobrança, meses pagos/pendentes, receita acumulada, botão "Gerar próxima cobrança".
    - Por hora: horas registradas, horas faturadas, receita gerada.
    - Banco de horas: contratadas / utilizadas / restantes + barra de consumo.
  - Lista das tarefas com horas/custos consumidos.

**`TaskDrawer.tsx`**: nova seção "Tempo & Custo" com inputs `time_spent` (h:mm), `internal_cost`, `generated_value`, toggle `billable`. Só destaca quando o projeto da tarefa é `por_hora` ou `banco_horas`.

## 4. Não muda
- Navegação, rotas, módulos.
- Esquema de tarefas/clientes/finances além das colunas adicionadas.
- RLS, policies, GRANTs (apenas novas colunas em tabelas existentes).
- Componentes do redesign Command Center recém-feitos — Comercial entra como mais um bloco.

## Perguntas
1. **Cobranças recorrentes**: gerar automaticamente via `pg_cron` mensal, ou apenas botão manual "Gerar próxima cobrança"? (sugestão: começar manual + `next_billing_date` visível; automatizar depois.)
2. **Horas trabalhadas**: usar o novo `time_spent_minutes` (entrada manual no drawer) ou aproveitar `actual_hours` já existente como única fonte? (sugestão: novo campo em minutos para precisão; migrar `actual_hours` para preencher inicial.)
