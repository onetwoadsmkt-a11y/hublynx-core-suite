# Novas contas: visual atual, menu e segurança

## O que a verificação confirmou
- O cadastro público cria o usuário, mas não faz o vínculo com uma empresa no código de cadastro. A criação por **Assinaturas (Admin)** grava usuário e assinatura antiga, sem provisionar empresa, membro e módulos nesse fluxo.
- O menu consulta os módulos da empresa. Sem empresa ou sem permissões individuais, os itens desses módulos ficam ocultos. Erros na consulta de empresas também podem virar uma lista vazia, sem explicação.
- Login, retorno do login e página inicial apontam para `/dashboard`; `/hub` redireciona para esse mesmo Dashboard. Portanto, não há evidência de uma página inicial exclusiva para contas novas.
- A logo depende do contexto da empresa e pode ficar invisível no login, onde esse contexto não é carregado. Há também marca armazenada por navegador, não por conta.
- Há controles antigos e novos de acesso coexistindo: assinatura ausente libera todas as permissões legadas; o bloqueio de acesso permite renderizar conteúdo enquanto carrega; a administração da plataforma aceita também o papel antigo `admin`. O rótulo do usuário mostra “Administrador” para todos.
- Uma migração histórica promove uma conta por e-mail automaticamente. Sua presença no banco atual **não foi confirmada**.

**Limite da verificação:** não foi possível consultar o banco externo nem entrar na conta indicada. O e-mail informado contém `gmail,.com`; confirmar o endereço exato antes de localizar ou corrigir qualquer cadastro. Não há confirmação de vazamento, das regras atuais do banco ou da causa específica do visual antigo dessa conta.

## Plano de correção

### 1. Confirmar a situação da conta e do visual
- Conferir empresa, vínculo ativo, papel, módulos contratados e permissões da conta afetada, com leitura autorizada do banco.
- Comparar a página publicada com a versão em edição, incluindo logo e menu; verificar se o visual antigo vem da versão publicada, da marca da empresa ou de informações guardadas no navegador.
- Não redesenhar o sistema nem restaurar telas antigas. Preservar o visual atual Core Suite e o texto preto do menu.

### 2. Alinhar a criação de novas contas
- Na criação administrativa, exigir a escolha de empresa existente ou criação de nova empresa, com papel e módulos explicitamente definidos pelo administrador.
- Reutilizar as estruturas de empresas e permissões existentes; não criar um segundo sistema de contas.
- Evitar cadastros parcialmente provisionados: validar os dados antes de gravar, tratar falhas e permitir repetir a operação sem duplicações.
- No cadastro público, manter a conta sem acesso a dados empresariais até aprovação e vínculo. Mostrar “Aguardando liberação de acesso”, em vez de menu vazio; não liberar módulos pagos nem privilégios automaticamente.
- Exibir confirmação por e-mail quando necessária, sem afirmar que o usuário já pode entrar antes de confirmar.
- Corrigir contas já afetadas somente após confirmar empresa e módulos autorizados; não transferir dados nem liberar tudo como solução.

### 3. Corrigir menu, marca e segurança de acesso
- Usar empresa ativa e permissões efetivas como referência consistente para menu e telas; não usar a assinatura antiga como atalho para liberar módulos ausentes.
- Diferenciar carregamento, erro de consulta, conta sem empresa e empresa sem módulos. Oferecer nova tentativa quando houver erro.
- Manter a logo Core Suite visível no login e impedir que a marca ou permissões de outra conta sejam reaproveitadas ao trocar usuário.
- Não exibir conteúdo protegido enquanto permissões estão sendo carregadas ou falharam.
- Conferir status da empresa e vínculo ativo; validar no servidor as operações de administração e concessão de módulos, além do controle visual.
- Reservar administração global ao papel de plataforma autorizado, após conferir os administradores atuais para não bloquear o administrador legítimo.
- Exibir o papel real do usuário, sem chamar toda conta de administrador.
- Revisar os controles antigos de ativação de módulos para que não concedam acesso além do contratado.

### 4. Auditar isolamento e validar o resultado
- Conferir no banco as regras de acesso, privilégios, gatilhos de cadastro e funções privilegiadas; verificar se a promoção automática por e-mail ou regras antigas ainda estão ativas.
- Se forem necessárias mudanças no banco, apresentar SQL separado para aprovação antes de executar. Não alterar tabelas, regras de acesso ou dados existentes silenciosamente.
- Testar criação administrativa, cadastro pendente, confirmação de e-mail, entrada, saída e troca de conta.
- Testar uma conta comum, administrador de empresa e administrador de plataforma: menus corretos, módulos não contratados bloqueados e ausência de acesso a outra empresa.
- Manter pequenos testes das regras de autorização e provisionamento. Conferir visualmente a conta afetada quando houver sessão de teste autorizada; informar explicitamente o que permanecer não verificado.

## Detalhes técnicos
- Pontos principais: `auth.tsx`, `auth.callback.tsx`, `subscriptions.functions.ts`, `platform.functions.ts`, `org.functions.ts`, `useWorkspace.tsx`, `useAccess.ts`, `AppShell.tsx`, `AccessGate.tsx`, `ModuleGate.tsx` e `HublynxLogo.tsx`.
- Autorizações administrativas devem ser verificadas pelo cliente autenticado antes de operações privilegiadas; credenciais permanecem somente no servidor.
- Cache de acesso deve acompanhar a identidade autenticada e a empresa, com limpeza na saída. Falhas de consulta não devem ser convertidas em autorização nem em ausência silenciosa de empresa.
- Sem alteração de cálculos financeiros, pipeline, modelos de projeto ou conteúdo dos projetos.