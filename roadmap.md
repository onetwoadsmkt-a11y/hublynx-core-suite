# Roadmap — Reestruturação Hublynx (plano aprovado 09/09/2026)

- [x] Tarefas — filtro por intervalo de datas compartilhado entre Lista, Kanban e Calendário, incluindo agendamentos de leads.

- [x] Pipeline — agendamentos integrados às visualizações Lista, Kanban e Calendário de Tarefas, com ações na origem, escopo da empresa e seis testes aprovados.
- [ ] Pipeline — conferir a tarefa agendada do lead demo na conta real; bloqueado pela ausência de sessão autenticada no banco externo.

- [x] Etapa 1 — SQL 01..05 aplicado no Supabase + backfill final dos registros sem organização
- [x] Nomenclatura "Core Suite" → "Hublynx" (títulos, logo, hub)
- [x] Etapa 2 — acesso por organização/módulo (`getMyOrgAccess`, `useOrgAccess`, `AccessGate`, menu filtrado). Financeiro só para empresas com o módulo
- [x] Etapa 3 — roadmap relacional (`project_stages`), modelos de projeto (`/configuracoes/modelos`) e "Converter em Projeto" aplicando modelo. Rename clients→customers dispensado por decisão do usuário
- [x] Etapa 4 — Central Administrativa em `/admin` (visão geral, empresas + módulos, usuários, preços/faixas, simulador, assinaturas)
- [x] Etapa 5 — Uso por organização (`recalcUsage`/`listUsage`) e tela `/admin/armazenamento` com limites por faixa
- [x] Etapa 6 — Endurecimento aplicado e validado manualmente no Supabase (organization_id obrigatório, gatilhos, 4 policies por tabela, super admin global)
- [x] Etapa 7 — Aplicativo alinhado a organizações: contexto/seletor de empresa via `getMyOrgAccess`, filtros e inserts por `organization_id` (pipeline, leads, notas, tarefas, arquivos, webhooks, clientes, projetos), webhook público grava a empresa, menu com carregamento e Central Administrativa com usuários e permissões por módulo
- [x] Etapa 8 — Empresa aplicada nas criações dos demais módulos: financeiro (lançamentos, recorrências, parcelas, repasse), recebíveis por projeto, linhas de serviço, marcos/equipe/riscos/custos/cobranças de projeto e tarefas (empresa ativa)
- [ ] Etapa 9 — Estrutura fiscal (NFS-e): `supabase/migrations-org/07_fiscal.sql` gerado e aprovado; aguardando execução manual no Supabase pelo usuário. Sem emissão real nesta fase.
- [x] Pipeline — captação, mapeamento e destaque de pontuação/classificação de leads; respostas do formulário no detalhe
- [x] Projetos — seções organizadas em abas; evolução com gráfico e progresso das etapas, sem alterar ações existentes
- [x] Projetos — roadmap vertical como padrão, alternativa horizontal e preferência local; atualização aceita sem erros
- [ ] Projetos — conferir roadmap vertical/horizontal e modal de tarefas em projeto real; bloqueado pela ausência de sessão autenticada no banco externo
- [ ] Projetos — conferir as abas com um projeto real; bloqueado pela ausência de sessão autenticada disponível para testes
- [x] Contas — provisionamento administrativo com empresa/módulos explícitos; erros visíveis, marca por identidade e testes de regras
- [x] Contas — cadastro e regras de teste de 14 dias preparados; 11 testes aprovados e tela de cadastro conferida
- [ ] Contas — ativar e conferir teste automático completo; bloqueado pela aplicação autorizada de `12_signup_trial.sql` e acesso ao banco externo
- [ ] Contas — validar criação administrativa e troca de contas reais; bloqueado pela ausência de sessão autorizada no banco externo
- [ ] Segurança — retirar compatibilidade do papel admin legado após conferir os administradores atuais; bloqueado pela auditoria do banco externo
- [ ] Contas — conferir cadastro afetado, administradores atuais e segurança do banco externo; bloqueado por acesso de auditoria e e-mail válido
- [x] Ajustar métricas do Dashboard com a situação real do sistema
