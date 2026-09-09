# Hublynx — Reestruturação como Digital Business Ecosystem (CRM + Projects, multi-tenant)

Diagnóstico feito somente em leitura (código + banco externo `gyxzrnoxzaraossrqyuc`). Nada foi alterado.

## 1. Estrutura atual encontrada

- **Banco**: ~30 migrations. Tabelas com dados: `leads` (~1013), `lead_events`, `lead_notes`, `lead_tasks`, `pipelines` (3), `pipeline_stages`, `lead_webhooks`, `clients` (5), `projects` (10), `tasks`, `finances`, `baixas`, `contas`, `servicos`, `profiles`, `user_roles` (4 admins), `subscriptions` (2, por `user_id`), `user_modules` (6, por `user_id` + `module_slug`), `workspaces` (2), `workspace_members` (2), `google_connections`, `app_config`. `lead_files`/`files` existem vazias. **Nenhum bucket de Storage** criado.
- **Posse dos dados**: `owner_id` / `user_id` / `empresa_id`; só `leads` tem `workspace_id`. **Nenhuma tabela tem `organization_id`** — as 4 migrations preparadas antes não foram aplicadas (serão substituídas).
- **RLS**: baseada em `auth.uid()` + funções `has_role` / `is_admin`.
- **Acesso no app**: `subscriptions.capabilities` (hub/comercial/operacao/financeiro/configuracoes) via `useAccess` + `AccessGate`; `user_modules` liga PWAs por slug; `WorkspaceProvider` (Fase 2) já resolve workspace ativo.
- **Navegação**: Hub Central / Comercial / Operação & Gestão / Configurações / Admin (Assinaturas, Usuários).
- **Google**: OAuth por usuário em `google_connections` (Gmail, Calendar, Drive, Sheets), credenciais só no servidor — funcionando.
- **Conversão Lead → Cliente → Projeto** já existe (`WinLeadDialog` + `convertLeadToClient`).
- **Roadmap** de projeto: etapas em JSONB dentro de `projects` (sem tarefas por etapa, sem dependências/responsável).

## 2. O que será reaproveitado

Autenticação, usuários, `WorkspaceProvider` (evolui para organização), pipeline/kanban completo, leads + notas/eventos/tarefas/tags/webhooks, `clients` (vira `customers`), projetos e tarefas, agenda, integrações Google, PWAs por módulo, `WinLeadDialog` (vira "Converter em Projeto"), tela Admin de assinaturas/usuários (evolui para Central Administrativa), identidade visual.

## 3. O que precisa mudar

- Modelo de acesso: `capabilities` por assinatura de usuário → **módulos por organização + permissão por usuário**.
- Menu lateral: nova hierarquia (Visão Geral / Módulos / Configurações) + Central Admin separada.
- Roadmap: JSONB → tabelas `project_stages` + tarefas ligadas à etapa + templates por organização.
- Clientes: `clients` → `customers` compartilhado entre CRM e Projects.
- Nomenclatura "Core Suite" → "Hublynx" (títulos, logo alt, hub).
- Financeiro atual: registrado como módulo `finance` **oculto** (ativo só para a organização Hublynx); telas preservadas.

## 4. Novas tabelas

| Tabela | Finalidade |
|---|---|
| `organizations` (id, name, slug, logo_url, document, status, timestamps) | workspace da empresa; IDs copiados de `workspaces` |
| `organization_members` (org, user, role: super_admin/org_admin/user/guest, status) | vínculo usuário↔empresa; copia `workspace_members` |
| `modules` (code, name, description, active) | seed: crm, projects, finance (oculto) |
| `organization_modules` (org, module, enabled, activated_at, deactivated_at) | contratação por empresa |
| `user_module_permissions` (org, user, module, can_access, permissions jsonb) | acesso por usuário |
| `pricing_config` (key, value, active, changed_by, valid_from) | preços com histórico |
| `resource_tiers` (min_users, max_users, database_limit_mb, storage_limit_mb, active) | faixas de banco/arquivos |
| `commercial_simulations` (empresa, contato, módulos, usuários, totais, status: aberta/proposta/aprovada/convertida, organization_id criado) | simulador + proposta |
| `subscription_modules` (subscription_id, module_id, price_at_contract) | preço congelado no contrato |
| `project_templates` + `project_template_stages` (por organização) | templates configuráveis |
| `project_stages` (projeto, nome, descrição, ordem, responsável, datas, status, percentual, dependências, checklist jsonb, observações) | roadmap relacional |
| `organization_usage` (org, db_mb, storage_mb, users, measured_at) | snapshot de utilização (atualizado sob demanda) |
| `external_files` (org, provider, drive_file_id, drive_url, related_type, related_id) | referências Google Drive |

`clients` recebe colunas novas (`company_name`, `document`) e é renomeada para `customers` com **view `clients` de compatibilidade** até todo código migrar.

## 5. Tabelas atuais que recebem `organization_id` (nullable → backfill → NOT NULL)

`leads, lead_notes, lead_events, lead_tasks, lead_files, lead_webhooks, pipelines, pipeline_stages, kanban_columns, clients/customers, projects, tasks, task_labels, files, finances, finance_categories, servicos, contas, baixas, subscriptions, google_sheets_sync, forms, google_connections (referência, continua por usuário)`.

`subscriptions` ganha `organization_id, total_users, monthly_price, renewal_date`; `user_id/account_name/capabilities` ficam como legado (não apagados).

## 6. Alterações de RLS

- Funções `is_org_member(org)`, `org_role(org)`, `is_super_admin()` (security definer, não recursivas).
- Em cada tabela operacional: novas policies "membro da organização" em SELECT/INSERT/UPDATE/DELETE, **adicionadas ao lado das atuais por `owner_id`** (transição). Remoção das antigas só após validação (fase final, aprovação separada).
- Tabelas admin (`organizations`, `modules`, `pricing_config`, `resource_tiers`, `commercial_simulations`): super admin gerencia; org_admin lê/edita só a própria organização; user lê só o necessário.
- Storage: bucket `org-files` privado com policy por prefixo `{organization_id}/crm/...` e `{organization_id}/projects/...`.

## 7. Impacto nas telas existentes

- `AppShell`: menu novo; `useAccess` passa a ler módulos + permissões da organização (mantendo fallback para `capabilities` durante a transição).
- Pipeline/Leads/Clientes/Projetos/Tarefas/Agenda: filtros trocam `workspace_id`/`owner_id` por `organization_id` (gravação nova sempre com `organization_id` + `owner_id` preservado).
- Projeto: roadmap passa a ler `project_stages` (JSONB atual migrado para linhas).
- Admin: `/admin/*` vira Central Administrativa (Dashboard, Empresas, Módulos, Usuários, Comercial/Simulações, Assinaturas, Utilização, Preços).
- Configurações da empresa: Usuários, Empresa, Integrações (existente), Armazenamento (novo), Assinatura (novo, somente leitura).
- Financeiro: inalterado, visível só quando módulo `finance` estiver habilitado na organização.

## 8. Impacto nas integrações Google

Nenhuma alteração no OAuth. `google_connections` continua por usuário; ganha `organization_id` para relatório/uso. Drive passa a gravar referência em `external_files`; Gmail/Calendar/Meet/Sheets mantidos como estão.

## 9. Riscos de migração

- Backfill de `organization_id` em linhas órfãs (owner sem workspace) → relatório de pendências antes de `NOT NULL`.
- Rename `clients → customers`: mitigado pela view de compatibilidade e troca gradual no código.
- Duplicidade de regras de acesso durante a transição (capabilities + módulos) → fallback explícito e testes com as contas `hublynx.dev` e `franquias`.
- Webhook público de leads resolve organização pelo `lead_webhooks.organization_id` (backfill obrigatório antes de virar a chave).
- Roadmap JSONB → tabela: migração idempotente, JSONB mantido até validar.
- Sem acesso DDL daqui: cada bloco SQL é entregue para você aplicar no SQL Editor, com verificação ao final.

## 10. Ordem recomendada (cada etapa = aprovação + SQL entregue + código correspondente)

1. **Fundação multi-tenant**: organizations/members/modules/org_modules/user_module_permissions + `organization_id` em tudo + backfill + RLS aditiva. Seed: org Hublynx (finance+crm+projects), org Valesafe (crm), super admin `hublynx.dev@gmail.com`.
2. **App na organização**: `useOrganization`/`useAccess` novos, menu novo, filtros por `organization_id`, nomenclatura Hublynx.
3. **Customers compartilhado** + Projects como módulo (menu próprio, `project_stages`, templates, conversão "Converter em Projeto" com template).
4. **Central Administrativa**: empresas, módulos, usuários, preços, faixas de recursos, simulador + card de proposta, "Transformar em cliente", assinaturas com `subscription_modules`.
5. **Utilização & Storage**: bucket por organização, tela Armazenamento com barras e alertas 70/90/100% (sem bloqueio), dashboard admin (sem polling).
6. **Endurecimento** (aprovação separada): `NOT NULL`, remoção de policies por `owner_id`, descontinuar `workspaces`/`capabilities`.

## Detalhes técnicos

- Sem `setInterval`/`refetchInterval`/Realtime global; invalidações pontuais por `queryKey`.
- Server functions com `requireSupabaseAuth`; service role só em ações de super admin após checagem de papel.
- Preços e faixas lidos de `pricing_config`/`resource_tiers`; cálculo: `MODULE_TOTAL + max(0, users - included) * additional_user_price`; anual = mensal × 12.
- Design: navy `#071A3D`, azul `#2563EB`, verde `#00D084`; cards claros, sem excesso de gradiente; desktop-first no admin.
- Não incluído: WhatsApp, automações, telas de Finance/Logistics/Services, cobrança automática, Guest funcional (só o papel na tabela).
