## Objetivo

A página de Clientes deixa de exibir valor de contrato e serviço. Cada cliente lista quantos projetos possui, e o cadastro/edição passa a focar em identificação, contato, observações e nos projetos vinculados (sem editar valor mensal/contrato no próprio cliente).

## Mudanças

### 1. `src/routes/_authenticated/clientes.tsx` — listagem
- Remover filtro **Serviço** e a opção de ordenação **"Maior valor mensal"** (manter "Mais recentes" e "Nome A–Z").
- Trocar colunas da tabela:
  - Remover **Serviço**, **Renovação** e **Valor /mês**.
  - Adicionar coluna **Projetos** (à direita, antes de Ações) mostrando a quantidade de projetos do cliente como badge.
- Manter colunas: Cliente, Status, Contato, Ações.
- Carregar contagem de projetos por cliente via `listProjects` (já existe) e agregá-la por `client_id` no front (mesma página já usa react-query; adicionar uma segunda `useQuery`).

### 2. `src/components/clients/ClientFormDialog.tsx` — modal Editar/Novo Cliente
- Remover o campo **Serviço contratado** da seção Identificação.
- Renomear a seção **"Contrato"** para **"Projetos"** e remover os campos `monthly_value`, `contract_start`, `contract_renewal` (a seção passa a hospedar a lista de projetos).
- Após a seção **Observações**, exibir uma nova seção **"Projetos deste cliente"**:
  - Apenas em modo edição (quando `client?.id` existe).
  - Lista compacta dos projetos vinculados (nome, status badge, datas), separando "Em andamento" (status ≠ `concluido`/`cancelado`) e "Finalizados" (`concluido`).
  - Estado vazio: "Nenhum projeto vinculado a este cliente."
  - Fonte de dados: `listProjects` filtrado por `client_id`.
- Limpar o schema/zod e o payload do upsert removendo os campos retirados (continua salvando os demais).

### 3. `src/components/clients/ClientCard.tsx` (se ainda em uso)
- Remover exibição de `service`, `contract_renewal` e `monthly_value` (substituir bloco do rodapé por contagem de projetos) para manter consistência caso o card seja reutilizado.

## Fora do escopo
- Não alteramos o schema do banco (`clients.service`, `monthly_value`, `contract_start`, `contract_renewal` continuam existindo — apenas deixam de ser editáveis/exibidos).
- Financeiro segue computando por projeto como já faz hoje; nenhuma mudança em finance.
- Sem mudanças no `ClientDrawer` (já mostra projetos relacionados).
