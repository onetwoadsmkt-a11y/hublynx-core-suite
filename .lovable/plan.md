
## 1. Roadmap desabilitado para "Mensal Recorrente"

Em `src/routes/_authenticated/projetos.$id.tsx`, condicionar a renderização do `<RoadmapStagesPanel />`:

- Se `p.commercial_model === "mensal_recorrente"`, renderizar uma versão desabilitada do painel: mesmo cabeçalho ("Roadmap do Projeto"), mas com uma mensagem `"Roadmap indisponível para projetos de modelo Mensal Recorrente"` e sem etapas/editar.
- Em `src/components/projects/RoadmapStages.tsx`, aceitar uma prop opcional `disabled?: boolean` que oculta os botões de etapa e o botão "Editar etapas", mostrando apenas a mensagem.

## 2. Card "Comercial" reestruturado

Manter o **Resumo Financeiro** atual (KPIs de Receita, Custos, Lucro, Margem e os blocos específicos por modelo).

Logo abaixo, adicionar uma nova seção **"Lançamentos Comerciais"** em formato de tabela, com:

### Tabela de lançamentos
Colunas: `Data` · `Tipo` (Receita/Despesa) · `Periodicidade` (Diária/Mensal) · `Descrição` · `Valor` · `Status` (Pendente/Recebido/Pago) · `Ações` (editar/excluir).

Toolbar acima da tabela:
- Filtro por tipo (todas / receitas / despesas) e por periodicidade (diária / mensal).
- Botão **"+ Nova Receita"** e **"+ Nova Despesa"** → abre dialog com campos: data, periodicidade (diária/mensal), descrição, valor, status, método de pagamento.
- Botão **"Gerar Cobrança"** → para qualquer modelo, cria uma receita pendente vinculada ao projeto/cliente com o valor mensal (quando aplicável) ou valor digitado em prompt.

Rodapé da tabela: totais de Receita realizada · Despesa realizada · Saldo do período.

### Backend
Reutilizar a tabela `finances` existente (já tem `project_id`, `client_id`, `kind` receber/pagar, `recurrence` none/monthly, `status`, `due_date`, `paid_at`, `amount`).

Para representar "Diária" sem alterar schema, usar `recurrence = "none"` com um campo lógico no front (a periodicidade diária = lançamentos avulsos do dia; mensal = `recurrence = "monthly"`).

Novas server functions em `src/lib/projects/projects.functions.ts` (ou um novo `project-finance.functions.ts`):
- `listProjectFinances({ project_id })` — retorna lançamentos do projeto agregados com totais.
- `upsertProjectFinance({...})` — insere/edita receita ou despesa do projeto.
- `deleteProjectFinance({ id })`.
- Adaptar `generateRecurringInvoice` para aceitar qualquer modelo (não apenas mensal_recorrente/suporte_continuo) quando chamado pelo botão "Gerar Cobrança".

Invalidar `["project-dashboard", id]` e `["finance"]` após mutações para refletir nos KPIs e no módulo Financeiro.

### Componente
Criar `src/components/projects/ProjectCommercialTable.tsx` com a tabela, filtros, dialog de novo lançamento e botão de gerar cobrança. Importado em `CommercialPanel`.

## Arquivos afetados
- `src/components/projects/RoadmapStages.tsx` — prop `disabled`.
- `src/routes/_authenticated/projetos.$id.tsx` — passar `disabled` e usar nova tabela em `CommercialPanel`.
- `src/components/projects/ProjectCommercialTable.tsx` — novo.
- `src/lib/projects/projects.functions.ts` — novas funções de finance do projeto + ajuste em `generateRecurringInvoice`.

Nenhuma migration necessária (reusa `finances`).
