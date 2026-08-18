# Operação & Gestão integradas + Financeiro protegido por senha

## 1. Menu reorganizado

Os grupos "Operações" e "Gestão" viram um grupo único **Operação & Gestão**, na ordem:

```text
Hub Central
Dashboard

COMERCIAL
  Pipeline de Vendas
  LEADS
  Atendimento

OPERAÇÃO & GESTÃO
  Tarefas
  Projetos
  Agenda
  Arquivos
  Clientes
  Financeiro   (cadeado)
  Relatórios

ADMINISTRAÇÃO
  Configurações
```

O item Financeiro mostra um ícone de cadeado enquanto a sessão financeira estiver travada.

## 2. Financeiro simplificado em 3 visões

As abas atuais (9) são reduzidas para 4, sem apagar as rotas antigas:

- **Visão Geral** — KPIs do mês (previsto, recebido, em aberto, a pagar, saldo) + gráfico de fluxo e alertas de atraso.
- **Previsão de Faturamento** — projeção dos próximos 12 meses gerada automaticamente a partir dos contratos recorrentes dos projetos (`valor mensal` + `dia de cobrança` + modelo comercial), comparada com o que já está lançado. Cada linha mostra: cliente, projeto, valor mensal, meses previstos, e um botão "Gerar cobranças" para transformar a previsão em contas a receber reais.
- **Recebíveis** — matriz cliente × projeto × mês já existente, com marcação rápida de recebido.
- **Contas a Pagar** — mesma estrutura da anterior, com filtro por fornecedor/categoria, status e vencimento, e ação "marcar como pago".

As abas antigas (DRE, calendário, categorias, recorrências) passam para um menu "Mais" dentro do módulo, preservando o código.

## 3. Integração Projetos → Financeiro

- Todo projeto com modelo comercial recorrente alimenta a previsão automaticamente; nada precisa ser digitado duas vezes.
- Na página do projeto, um bloco "Financeiro do projeto" mostra previsto/recebido/em aberto e link direto para os lançamentos daquele projeto.
- Na página do cliente, um resumo consolidado dos projetos (previsto no ano, recebido, inadimplência).

## 4. Bloqueio por senha (valores ocultos em todo o sistema)

- Ao entrar em **Financeiro** aparece uma tela de desbloqueio pedindo a **senha da conta**.
- Enquanto travado, **todo valor em R$ do sistema** aparece como `R$ ••••` — dashboard, projetos, clientes, leads, relatórios e financeiro.
- Um botão de olho no cabeçalho permite travar novamente a qualquer momento; o desbloqueio dura a sessão do navegador (aba fechada = travado de novo).

### Sobre login com Google

Contas que entraram apenas com Google não possuem senha de conta. Nesse caso, na primeira vez o sistema pede para **definir uma senha de acesso** (feita pelo próprio painel de conta, sem sair do sistema) e depois passa a usá-la como senha do financeiro. A verificação é feita no servidor — nada de senha guardada no navegador.

## Detalhes técnicos

- `AppShell.tsx`: fusão dos grupos `Operações`/`Gestão` em `NAV_GROUPS`; ícone de cadeado condicionado ao contexto de bloqueio.
- Novo `src/lib/security/finance-lock.functions.ts`: server fn `verifyAccountPassword` (autenticada) que revalida a senha via Supabase Auth e devolve apenas `{ ok: true }`; nunca ecoa a senha. `hasPasswordIdentity` para detectar contas Google-only.
- Novo `src/context/ValueLockProvider.tsx` + hook `useMoney()`: estado em `sessionStorage` (`finance-unlocked`), componente `<Money value={n} />` que renderiza `R$ ••••` quando travado. Substituição dos `formatCurrency` diretos nas telas de dashboard, projetos, clientes, pipeline, relatórios e financeiro.
- Novo `src/components/finance/FinanceLockScreen.tsx` renderizado por `financeiro.tsx` enquanto `!unlocked`.
- Nova server fn `getBillingForecast` em `src/lib/finance/receivables.functions.ts`: lê `projects` com `commercial_model` recorrente (`monthly_value`, `billing_day`, `next_billing_date`, `contract_value`) + `finances` já lançadas, e devolve matriz de 12 meses previsto × lançado. Ação `generateForecastCharges` cria os `finances` faltantes respeitando o índice único `uq_finances_parent_due`.
- `financeiro.tsx`: TABS reduzidos a 4 + submenu "Mais" apontando para as rotas existentes (nenhum arquivo de rota removido).
- Nenhuma migração de schema é necessária: os campos de recorrência já existem em `projects`.
