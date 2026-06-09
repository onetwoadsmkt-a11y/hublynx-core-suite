
# Hublynx Core — Plano de Construção

Escopo enorme. Vou entregar em **fases incrementais**, cada uma utilizável ao final. Stack do template: **TanStack Start + React + TypeScript + Tailwind v4 + shadcn/ui + Supabase (Lovable Cloud) + React Query + Recharts**. (Roteamento via TanStack Router — equivalente ao React Router pedido.)

---

## Fase 1 — Fundação (design system + auth + layout)

1. **Design system Hublynx** em `src/styles.css`
   - Tokens: `--brand-dark #071A3D`, `--brand-blue #2563EB`, `--brand-green #00D084`, cinza `#F8FAFC`, branco
   - Fonte: **Lexend** (display) + **Inter** (body) via `<link>` no `__root.tsx`
   - Bordas arredondadas (`--radius: 0.75rem`), sombras suaves, fundo branco
2. **Lovable Cloud** ativado (Supabase gerenciado)
3. **Auth completo**: login, signup, recuperação de senha, `/reset-password`, sessão persistente
   - Tabela `profiles` (nome, avatar, empresa)
   - Tabela `user_roles` + enum `app_role` (`admin`, `user`) + função `has_role` (padrão seguro)
   - Trigger auto-cria profile no signup
4. **Layout principal** sob `_authenticated/`
   - Sidebar fixa (shadcn sidebar, colapsável) com 9 itens do menu
   - Header: busca global (⌘K), notificações, dropdown perfil
   - Logo Hublynx Core no topo da sidebar
5. **Dashboard executivo** (visual da imagem)
   - 5 cards de KPI: Tarefas, Projetos, A receber, Reuniões, Clientes
   - Seções: Tarefas do dia · Financeiro (3 gráficos Recharts) · Projetos em andamento (barras de progresso) · Próximos eventos

## Fase 2 — Tarefas + Projetos + Clientes

6. **Clientes** — CRUD completo (nome, empresa, contatos, redes, endereço, contrato com serviço/valor/renovação), página de detalhe com projetos ativos, faturamento total, histórico
7. **Projetos** — CRUD, status (5 estados), datas, valor, % progresso automático (baseado em tarefas), abas: Tarefas / Arquivos / Comentários / Histórico
8. **Tarefas** — CRUD com título, descrição, cliente, projeto, prioridade (4), status (7), datas, responsável, checklist, comentários, anexos
   - 3 visualizações: **Kanban** (drag-and-drop entre colunas via `@dnd-kit`), **Lista**, **Calendário**

## Fase 3 — Financeiro + Agenda + Arquivos + Relatórios

9. **Financeiro**
   - Contas a Receber + Contas a Pagar (CRUD, status, forma pagamento)
   - Categorias pré-cadastradas (receita/despesa conforme spec)
   - Fluxo de caixa com filtros 7/30/90 dias + gráficos (entradas/saídas/saldo)
10. **Agenda** — calendário (dia/semana/mês) com 5 tipos de evento
11. **Arquivos** — upload (Supabase Storage) por categoria, tipos PDF/DOCX/XLSX/PNG/JPG
12. **Relatórios** — dashboard de KPIs (receita mensal, clientes ativos, projetos ativos, tarefas concluídas, taxa conclusão)
13. **Configurações** — perfil, empresa, gestão de usuários (admin), preferências
14. **Notificações** — sistema básico (tabela + dropdown no header)

---

## Detalhes técnicos

**Banco de dados (Supabase, todas com RLS escopada por `owner_id = auth.uid()` + GRANTs explícitos para `authenticated` e `service_role`):**

```
profiles, user_roles
clients, client_contracts
projects, project_history
tasks, task_checklists, task_comments, task_attachments
finance_categories (seed), finances (a_receber | a_pagar)
events
files (metadata) + bucket Storage "files"
notifications
settings
```

Relacionamentos: `clients 1—N projects 1—N tasks`; `tasks N—1 users (responsável)`; `finances N—1 clients` (opcional) e `N—1 finance_categories`; `events N—1 clients` (opcional).

**Roteamento (TanStack Start, sob `_authenticated/`):**
```
/dashboard /tarefas /projetos /projetos/$id /clientes /clientes/$id
/financeiro /agenda /arquivos /relatorios /configuracoes
```
Rotas públicas: `/auth`, `/reset-password`.

**Arquitetura escalável (V2-ready):** módulos isolados em `src/features/<modulo>/` (components/hooks/queries/types), server functions em `*.functions.ts`, pronto para adicionar CRM, integrações, webhooks, multiempresa sem refator.

---

## O que NÃO entra agora
CRM/pipeline, integrações (Gmail, WhatsApp, Google Calendar, banco), IA, Make, webhooks, multiempresa, app mobile nativo — fica estruturado mas não implementado.

---

Vou começar pela **Fase 1** assim que aprovar. Quer ajustar alguma prioridade antes (ex: pular auth e usar mock, ou começar direto por algum módulo específico)?
