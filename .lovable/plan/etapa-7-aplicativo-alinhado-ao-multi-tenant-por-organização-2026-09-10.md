# Etapa 7 — Aplicativo alinhado ao multi-tenant por organização

Com o banco endurecido (organização obrigatória, gatilhos ativos, 4 regras por empresa em cada tabela), o aplicativo ainda opera com o conceito antigo de "workspace" e depende dos gatilhos para gravar a empresa. Esta etapa alinha o aplicativo ao novo modelo.

## Por que isso importa agora

O gatilho do banco preenche a empresa escolhendo a **primeira** empresa do usuário. Para o Super Admin da Hublynx, que enxerga todas as empresas, isso pode gravar um registro na empresa errada. O aplicativo precisa enviar a empresa ativa explicitamente em cada criação.

## O que muda

### 1. Seletor de empresa passa a usar as organizações
- O contexto atual lê as tabelas antigas de workspace. Passa a ler organizações e membros, mantendo a mesma interface para as telas (nada quebra).
- Como as organizações reaproveitam os mesmos identificadores dos workspaces, os dados existentes continuam válidos.
- Super Admin passa a ver todas as empresas no seletor; demais usuários veem só as suas.
- A troca de empresa passa a atualizar todas as telas dependentes (pipeline, leads, clientes, projetos, tarefas, financeiro, relatórios), não apenas as do pipeline.

### 2. Criação de registros grava a empresa ativa
Todas as telas que criam registros (lead, cliente, projeto, tarefa, lançamento financeiro, etapa, etiqueta, webhook, arquivo) passam a enviar a empresa ativa junto. O gatilho do banco continua como rede de segurança, não como regra principal.

### 3. Leitura filtrada por empresa
As consultas passam a filtrar por empresa em vez de por dono do registro. Hoje só o pipeline e leads fazem isso; projetos, tarefas, clientes, agenda, arquivos e financeiro ainda dependem do dono.

### 4. Webhook de entrada de leads
O endereço público de recebimento de leads resolve a empresa pelo dono do webhook. Passa a gravar a empresa diretamente a partir do cadastro do webhook, garantindo que leads externos entrem na empresa certa mesmo com o novo campo obrigatório.

### 5. Central Administrativa — gestão de usuários por empresa
A tela de empresas ganha:
- lista de usuários vinculados a cada empresa, com papel (administrador da empresa / usuário);
- convidar/vincular usuário existente a uma empresa;
- liberar módulos por usuário dentro da empresa (permissão individual), respeitando os módulos contratados;
- remover/desativar vínculo.

### 6. Menu e bloqueios
- Menu já filtra por módulo contratado. Passa a filtrar também por permissão individual do usuário dentro da empresa.
- Enquanto o acesso carrega, o menu mostra estado de carregamento em vez de liberar tudo, evitando piscar itens que o usuário não tem.

### 7. Encerramento do conceito antigo
As tabelas antigas de workspace deixam de ser lidas pelo aplicativo. Nenhuma tabela é apagada nesta etapa — só deixam de ser usadas. A remoção fica para uma etapa posterior, depois de validado.

## Detalhes técnicos

- `src/hooks/useWorkspace.tsx` passa a consumir `getMyOrgAccess` (organizações + papel + módulos) e mantém a assinatura atual (`activeWorkspaceId`, `setActiveWorkspace`, `role`, `isLoading`) para não quebrar consumidores; `listMyWorkspaces` e `src/lib/workspaces/*` são descontinuados.
- `scopeWorkspace`/`workspaceFields` viram `scopeOrganization`/`organizationFields`, filtrando/gravando `organization_id`.
- Auditoria de todos os `.insert(` em `src/lib/**` e `src/components/**` para incluir `organization_id` da empresa ativa; o servidor valida que a empresa recebida pertence ao usuário antes de gravar (nunca confiar só no que vem da tela).
- `src/routes/api/public/leads/$token.ts` grava `organization_id` a partir de `lead_webhooks.organization_id`.
- `useOrgAccess` deixa de retornar `true` em `hasModule` enquanto carrega; expõe `isLoading` para as telas.
- Nova função de servidor em `src/lib/platform/platform.functions.ts` para listar/vincular/remover membros e permissões de módulo por usuário, protegida por Super Admin ou administrador da própria empresa.
- Nova aba/seção em `src/routes/_authenticated/admin.empresas.tsx` para os usuários da empresa.
- Nenhuma alteração de banco nesta etapa.

## Verificação

- Checagem de tipos.
- Navegação autenticada como Super Admin (todas as empresas, troca de empresa) e como usuário da Valesafe (só Comercial).
- Criar um lead e um projeto com a empresa ativa e conferir a empresa gravada.
