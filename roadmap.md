# Roadmap — Reestruturação Hublynx (plano aprovado 09/09/2026)

- [x] Etapa 1 — SQL 01..05 aplicado no Supabase + backfill final dos registros sem organização
- [x] Nomenclatura "Core Suite" → "Hublynx" (títulos, logo, hub)
- [x] Etapa 2 — acesso por organização/módulo (`getMyOrgAccess`, `useOrgAccess`, `AccessGate`, menu filtrado). Financeiro só para empresas com o módulo
- [x] Etapa 3 — roadmap relacional (`project_stages`), modelos de projeto (`/configuracoes/modelos`) e "Converter em Projeto" aplicando modelo. Rename clients→customers dispensado por decisão do usuário
- [x] Etapa 4 — Central Administrativa em `/admin` (visão geral, empresas + módulos, usuários, preços/faixas, simulador, assinaturas)
- [x] Etapa 5 — Uso por organização (`recalcUsage`/`listUsage`) e tela `/admin/armazenamento` com limites por faixa
- [x] Etapa 6 — Endurecimento aplicado e validado manualmente no Supabase (organization_id obrigatório, gatilhos, 4 policies por tabela, super admin global)
- [x] Etapa 7 — Aplicativo alinhado a organizações: contexto/seletor de empresa via `getMyOrgAccess`, filtros e inserts por `organization_id` (pipeline, leads, notas, tarefas, arquivos, webhooks, clientes, projetos), webhook público grava a empresa, menu com carregamento e Central Administrativa com usuários e permissões por módulo
