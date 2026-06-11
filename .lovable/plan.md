
# Módulo Financeiro Mensal — Hublynx Core

Substituir o placeholder de `/financeiro` por uma Central Financeira executiva, reaproveitando as tabelas que já existem (`finances`, `finance_categories`, `project_costs`, `projects`, `clients`, `tasks`). Nada de recriar arquitetura — apenas estender.

## 1. Schema (migração mínima)

`finances` já cobre receitas/despesas (kind, status, client_id, project_id, category_id, amount, due_date, paid_at). Adicionar só o que falta:

- `finances.recurrence` (`text`, `none|monthly`, default `none`)
- `finances.recurrence_day` (`int`) — dia do vencimento mensal
- `finances.recurrence_until` (`date`, nullable)
- `finances.parent_id` (`uuid` → finances.id) — para parcelas/recorrências geradas
- `finances.installment_no` / `installment_total` (`int`) — projetos fechados parcelados
- Seed das categorias padrão (Receitas: Desenvolvimento, Tráfego Pago, Conteúdo, Consultoria, Suporte, Outros / Despesas: Salários, Freelancer, Software, Marketing, Hospedagem, Internet, Equipamentos, Impostos, Outros) via `finance_categories` com `is_default=true` por owner — criadas na primeira visita ao módulo (server fn `ensureDefaultCategories`).
- Job leve (server fn `runRecurringRollover`) chamado pelo loader do dashboard: gera o próximo lançamento `pendente` dos contratos recorrentes cujo último filho está a ≤ 35 dias do próximo ciclo. Idempotente via `parent_id + due_date` unique.
- Atualização automática de status `pendente → atrasado` quando `due_date < today` (view derivada — não persistir, computar no cliente/servidor).

## 2. Server functions (`src/lib/finance/finance.functions.ts`)

Todas protegidas com `requireSupabaseAuth`, retornando DTOs serializáveis:

- `getFinanceDashboard({ month, year })` → KPIs do mês: receita_realizada, receita_prevista, despesa_realizada, despesa_prevista, lucro, margem, saldo_caixa (sum recebido − sum pago até hoje), inadimplencia (vencidos não pagos), mrr (sum `monthly_value` de clients ativos + recorrências `monthly`).
- `listReceivables({ month, year, status?, clientId? })` / `listPayables(...)`
- `upsertFinance(payload)` — receita ou despesa, com geração de parcelas ou agendamento recorrente.
- `markFinanceStatus({ id, status, paid_at? })`
- `getCashflowSeries({ range: '30d'|'60d'|'90d'|'year' })` → array `{ date, in, out, balance }`.
- `getDRE({ month, year })` → receita_bruta, custos_operacionais (sum `project_costs` no mês), despesas (sum `finances` despesa pagas), lucro_liquido.
- `getProfitabilityByClient({ from, to })` / `getProfitabilityByProject({ from, to })` → receita (finances), custos (project_costs + finances despesa com `project_id`), lucro, margem; ordenável.
- `getForecast()` → próximos 30/60/90 dias com listas de recebimentos/pagamentos pendentes e saldo projetado acumulado.
- `getAlerts()` → contas vencidas, recebimentos próximos (7d), fluxo negativo projetado, contratos próximos do vencimento (`clients.contract_renewal` ≤ 30d), meta mensal (se definida nas `settings`).
- `runRecurringRollover()` — interno, chamado pelo dashboard.

## 3. Rotas e UI

Substituir `src/routes/_authenticated/financeiro.tsx` (placeholder) por layout com sub-rotas (Outlet):

```text
/financeiro                → dashboard
/financeiro/receber        → contas a receber
/financeiro/pagar          → contas a pagar
/financeiro/recorrencias   → contratos mensais
/financeiro/categorias     → CRUD de categorias
/financeiro/dre            → DRE simplificada + lucratividade
/financeiro/previsao       → previsão 30/60/90 + alertas
```

Cada sub-rota é arquivo separado (`financeiro.index.tsx`, `financeiro.receber.tsx`, etc.). Header compartilhado com **MonthYearPicker** (Jan…Dez + ano) sincronizado por `validateSearch` (`month`, `year`) — preserva contexto entre abas.

### 3.1 Dashboard (`/financeiro`)
- Grid de 8 KPI cards (Receita Mês, Receita Prevista, Despesa Mês, Lucro, Margem, Fluxo Caixa, Inadimplência, MRR) com ícones e cor semântica (verde positivo, vermelho negativo).
- Gráfico de **Fluxo de Caixa** (recharts `ComposedChart`: barras in/out + linha de saldo) com toggle 30/60/90/Ano.
- Painel lateral **Alertas** (chips coloridos) + **Próximos lançamentos** (top 5).

### 3.2 Receber / Pagar
- Tabela com filtros (status, cliente/fornecedor, categoria, busca), totalizadores no rodapé.
- Botão **+ Nova receita/despesa** abre `FinanceFormDialog` (campos: cliente/projeto/categoria, valor, vencimento, status, método, recorrência mensal opcional, parcelamento opcional).
- Ações inline: marcar como recebido/pago (date picker do `paid_at`), editar, excluir.
- Status `atrasado` calculado no render quando `pendente && due_date < hoje`.

### 3.3 Recorrências
- Lista de contratos (finances com `recurrence='monthly'` e `parent_id IS NULL`).
- Mostra próximas 3 gerações previstas; botão "Gerar agora".

### 3.4 DRE + Lucratividade
- Tabela DRE vertical (Receita Bruta, − Custos, − Despesas, = Lucro Líquido) com comparativo mês anterior.
- Ranking **Lucratividade por Cliente** e **por Projeto** (tabelas ordenáveis com barra de margem).
- Aba especial **Projetos**: detalha por modelo comercial — Fechado (parcelas pagas/total), Por Hora (horas × valor), Banco de Horas (contratadas/consumidas/saldo). Usa `projects.commercial_model`, `hourly_rate`, `hours_bank_*` e soma de `time_entries`/`tasks.actual_hours` (o que já existe).

### 3.5 Previsão
- Três colunas (30/60/90 dias) com lista de pendências e saldo projetado.

### 3.6 Categorias
- CRUD simples; bloquear delete em categorias com lançamentos (soft validation).

## 4. Integrações sem duplicação

- Ao mover um projeto fechado para `status=ganho` no módulo Projetos: server fn já existente (estendida) cria automaticamente as N parcelas em `finances` (`installment_no/total`, `parent_id` aponta para a primeira).
- Cliente recorrente (`clients.monthly_value` + `contract_start`): botão "Ativar cobrança recorrente" cria 1 registro `finances` com `recurrence='monthly'`.
- `project_costs` aparece automaticamente na DRE e nas lucratividades — não precisa lançar de novo em `finances`.
- Tarefas com `actual_hours` em projetos `por_hora` alimentam receita gerada (sem inserir em `finances` — calculado).

## 5. Realtime

Canal `finance-live` em `finances`, `project_costs`, `clients` → invalida queries `['finance', ...]` no TanStack Query. Mesmo padrão usado na Agenda.

## 6. Tech / convenções
- Read shape padrão: `ensureQueryData` + `useSuspenseQuery`. Rotas sob `_authenticated` (loader pode chamar fn protegida).
- Formatação BRL (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`) e datas pt-BR.
- Sem libs novas — `recharts`, `date-fns`, shadcn já presentes.

## 7. Arquivos

Novos:
- `src/lib/finance/finance.functions.ts`
- `src/lib/finance/types.ts`
- `src/components/finance/MonthYearPicker.tsx`
- `src/components/finance/FinanceFormDialog.tsx`
- `src/components/finance/KpiCard.tsx`
- `src/components/finance/CashflowChart.tsx`
- `src/components/finance/AlertsPanel.tsx`
- `src/routes/_authenticated/financeiro.tsx` (layout com Outlet — substitui placeholder)
- `src/routes/_authenticated/financeiro.index.tsx` (dashboard)
- `src/routes/_authenticated/financeiro.receber.tsx`
- `src/routes/_authenticated/financeiro.pagar.tsx`
- `src/routes/_authenticated/financeiro.recorrencias.tsx`
- `src/routes/_authenticated/financeiro.dre.tsx`
- `src/routes/_authenticated/financeiro.previsao.tsx`
- `src/routes/_authenticated/financeiro.categorias.tsx`
- Migração: colunas de recorrência/parcela em `finances` + index `(parent_id, due_date)`.

## Fora de escopo

- Conciliação bancária / OFX / Open Finance.
- Emissão de NF e boletos.
- Multi-moeda (apenas BRL).
- Edição em massa de lançamentos.
