# Roadmap — Reestruturação Hublynx (plano aprovado 09/09/2026)

- [x] Etapa 1 — SQL 01..05 aplicado no Supabase + backfill final dos registros sem organização
- [x] Nomenclatura "Core Suite" → "Hublynx" (títulos, logo, hub)
- [x] Etapa 2 — acesso por organização/módulo (`getMyOrgAccess`, `useOrgAccess`, `AccessGate`, menu filtrado). Financeiro só para empresas com o módulo
- [x] Etapa 3 — roadmap relacional (`project_stages`), modelos de projeto (`/configuracoes/modelos`) e "Converter em Projeto" aplicando modelo. Rename clients→customers dispensado por decisão do usuário
- [x] Etapa 4 — Central Administrativa em `/admin` (visão geral, empresas + módulos, usuários, preços/faixas, simulador, assinaturas)
- [x] Etapa 5 — Uso por organização (`recalcUsage`/`listUsage`) e tela `/admin/armazenamento` com limites por faixa
- [ ] Etapa 6 — Endurecimento: `supabase/migrations-org/06_hardening.sql` pronto (blocos A conferência, A2 gatilhos de organização, B NOT NULL, C remover policies antigas, D verificação). Aguardando execução manual no SQL Editor.
