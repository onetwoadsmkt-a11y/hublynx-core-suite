# Migrations multi-tenant (organization_id)

Aplicar **em ordem**, colando cada arquivo no SQL Editor do Supabase e conferindo a
consulta de verificação no final de cada um antes de seguir.

1. `01_organizations.sql` — cria `organizations` e `organization_members`, grants, RLS,
   função `is_org_member` e copia os registros de `workspaces`/`workspace_members`
   preservando os mesmos IDs.
2. `02_add_organization_id.sql` — adiciona a coluna `organization_id` (nullable), FK e índices.
3. `03_backfill.sql` — preenche `organization_id`. Só avance quando todos os
   `pendentes` do bloco final forem 0.
4. `04_rls_org.sql` — policies adicionais por organização (as antigas continuam ativas).

Fase 5 (posterior, após validação em produção): `NOT NULL`, remoção das policies
antigas por `owner_id` e descontinuação de `workspaces`. Não incluída aqui de propósito.

Nenhum arquivo aqui faz DROP de tabela, DELETE de dados ou alteração de colunas existentes.
