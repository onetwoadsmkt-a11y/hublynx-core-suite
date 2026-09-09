# Multi-tenant por organization_id — diagnóstico e plano incremental

Nada foi alterado no banco. Abaixo está o levantamento do que existe hoje e o plano de migrations para aprovação.

## 1. O que existe hoje (levantado direto do banco)

Dados atuais (contagens reais):
leads 1013 · lead_events 2969 · lead_notes 459 · lead_tasks 19 · finances 111 · baixas 55 · pipeline_stages 32 · tasks 21 · projects 10 · servicos 8 · lead_webhooks 6 · user_modules 6 · clients 5 · profiles 4 · user_roles 4 · pipelines 3 · workspaces 2 · workspace_members 2 · subscriptions 2 · app_config 2 · contas 1 · google_connections 1 · forms 1.
Tabelas vazias: files, lead_files, notifications, mail_accounts, settings, project_costs.

Modelos de posse convivendo hoje:
- `owner_id` (dono = usuário): leads, clients, projects, finances, finance_categories, tasks, pipelines, pipeline_stages, lead_notes, lead_events, lead_tasks, lead_webhooks, kanban_columns, task_labels, google_sheets_sync, forms.
- `user_id`: user_roles, user_modules, subscriptions, google_connections.
- `empresa_id` (já é um tenant paralelo!): servicos, contas, baixas.
- `workspace_id`: apenas `leads`.
- Sem posse: app_config, profiles.

Já existem `workspaces` (2 registros: "Rafael Pereira Santos" e "Valesafe Expansão", cada um com `legacy_owner_id`) e `workspace_members` (2 membros, papel `owner`). Não existe tabela `organizations`.

RLS atual: políticas baseadas em `auth.uid() = owner_id` (e `user_id`), com funções `has_role` / `is_admin` (SECURITY DEFINER). O acesso administrativo do app usa a chave de serviço apenas no backend.

Migrations: 30+ arquivos em `supabase/migrations/`, o último de 27/08. Como o banco hoje é o Supabase externo, **não há como aplicar DDL por ferramenta**: o SQL precisa ser colado por você no SQL Editor do Supabase. Eu entrego cada etapa em arquivo versionado e pronta para colar.

## 2. Decisão de arquitetura proposta

`workspaces` já é, na prática, a tabela de tenant. Proposta: **renomear conceitualmente para organização adotando `organization_id` como nome padrão da coluna**, sem dropar nada:
- criar `public.organizations` e `public.organization_members` como as tabelas oficiais do tenant, populadas a partir de `workspaces`/`workspace_members` (mesmos `id`, para não quebrar `leads.workspace_id`);
- manter `workspaces`/`workspace_members` intactas durante a transição (nenhum drop nesta fase);
- adicionar `organization_id` nas tabelas de negócio, preenchendo pelo `owner_id` → `organizations.legacy_owner_id`;
- `empresa_id` de servicos/contas/baixas passa a ser mapeado para a organização correspondente (coluna nova, sem apagar `empresa_id`).

## 3. Tabelas criadas

- `organizations` (id, name, slug, legacy_owner_id, active, timestamps)
- `organization_members` (id, organization_id FK, user_id FK auth.users, role, unique(organization_id,user_id))

## 4. Tabelas modificadas (apenas ADD COLUMN, nullable)

Nova coluna `organization_id uuid REFERENCES public.organizations(id)` em:
leads, clients, projects, finances, finance_categories, tasks, pipelines, pipeline_stages, lead_notes, lead_events, lead_tasks, lead_webhooks, kanban_columns, task_labels, google_sheets_sync, forms, servicos, contas, baixas, subscriptions, user_modules.

Nenhuma coluna existente é removida, renomeada ou alterada de tipo. `owner_id`, `user_id`, `empresa_id` e `leads.workspace_id` permanecem.

## 5. Foreign keys e índices

- FK `organization_id → organizations(id)` ON DELETE RESTRICT em todas as tabelas acima.
- FK `organization_members.organization_id → organizations(id)` ON DELETE CASCADE; `user_id → auth.users(id)` ON DELETE CASCADE.
- Índice em `organization_id` de cada tabela; índice composto `(organization_id, created_at DESC)` em leads; `(organization_id, stage_id)` em leads; unique `organizations.slug`.

## 6. Policies RLS

Nesta fase **nenhuma policy atual é apagada**. Serão adicionadas:
- função `public.is_org_member(_org uuid)` SECURITY DEFINER, `search_path = public`, lendo `organization_members`;
- policies **adicionais** (permissivas, somam-se às atuais) de SELECT/INSERT/UPDATE/DELETE por `is_org_member(organization_id)` nas tabelas de negócio;
- GRANTs para `authenticated` e `service_role` nas duas tabelas novas; sem `anon`.

A remoção das policies antigas de `owner_id` fica para uma fase posterior, só depois de validado em produção.

## 7. Impacto nos dados e estratégia de migração

- Zero perda: só INSERT nas tabelas novas e UPDATE preenchendo `organization_id`.
- `organizations` recebe os 2 registros de `workspaces` com o mesmo `id` — logo `leads.workspace_id` já aponta para uma organização válida.
- Backfill: `organization_id = (select id from organizations where legacy_owner_id = t.owner_id)` para tabelas com `owner_id`; via `lead_id`/`finance_id` para tabelas filhas sem dono direto; `empresa_id` mapeado 1:1 para servicos/contas/baixas.
- Verificação obrigatória após cada etapa: contagem de linhas com `organization_id IS NULL` deve ser 0 antes de seguir.
- Colunas seguem NULLABLE nesta fase; o `NOT NULL` entra só na fase final, após o app estar gravando o campo.

## 8. Ordem das migrations

1. `01_organizations.sql` — cria as duas tabelas, grants, RLS, função `is_org_member`, e copia de workspaces/workspace_members.
2. `02_add_organization_id.sql` — ADD COLUMN + FK + índices (sem backfill).
3. `03_backfill.sql` — preenche `organization_id` + consultas de verificação.
4. `04_rls_org.sql` — policies adicionais por organização.
5. (posterior, após validação) `05_enforce.sql` — NOT NULL, retirada das policies antigas por `owner_id`, descontinuação de `workspaces`.

Aplicação: entrego os arquivos e você cola no SQL Editor do Supabase, etapa por etapa, conferindo as verificações antes de avançar.

## 9. Ajustes no aplicativo (depois das migrations 1–3)

`useWorkspace` passa a ler `organizations`/`organization_members` mantendo a mesma interface; helper `scopeWorkspace` vira `scopeOrganization`; inserts passam a gravar `organization_id` além de `owner_id`. Nenhuma tela muda de comportamento.

## 10. Aguardando aprovação

Nada será executado no Supabase antes do seu OK. Confirme se a nomenclatura `organizations` + `organization_members` reaproveitando os IDs de `workspaces` está aprovada.
