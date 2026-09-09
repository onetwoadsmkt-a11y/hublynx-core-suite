# Etapa 1 — Fundação multi-tenant Hublynx

Aplicar **em ordem** no SQL Editor do Supabase (`gyxzrnoxzaraossrqyuc`), conferindo a
consulta de verificação no final de cada arquivo antes de seguir.

| # | Arquivo | O que faz |
|---|---|---|
| 1 | `01_foundation.sql` | `organizations`, `organization_members`, `platform_admins`, `modules`, `organization_modules`, `user_module_permissions`; funções `is_super_admin`, `is_org_member`, `org_role`, `is_org_admin`, `has_module`; copia `workspaces` (mesmos IDs); seed dos módulos (crm, projects, finance-interno); Hublynx = crm+projects+finance, Valesafe = crm; super admin `hublynx.dev@gmail.com`. |
| 2 | `02_organization_id.sql` | `organization_id` (nullable) + FK + índices em 24 tabelas; colunas extras em `clients`, `subscriptions`, `projects`. |
| 3 | `03_backfill.sql` | Preenche `organization_id`. **Todos os `pendentes` do bloco final precisam ser 0** antes do arquivo 4. |
| 4 | `04_rls_org.sql` | Policies adicionais por organização (as antigas por `owner_id` continuam), bucket privado `org-files` com policy por pasta `{organization_id}/`. |
| 5 | `05_platform.sql` | `pricing_config`, `resource_tiers`, `commercial_simulations`, `subscription_modules`, `project_templates(+stages)`, `project_stages`, `organization_usage`, `external_files`, RPC `measure_organization_usage`; migra o roadmap JSONB para `project_stages`. |

Nenhum arquivo faz DROP de tabela, DELETE de dados ou alteração de colunas existentes.

Fase final (aprovação separada, após validação): `NOT NULL` em `organization_id`, remoção das
policies por `owner_id`, descontinuação de `workspaces` e `subscriptions.capabilities`.
