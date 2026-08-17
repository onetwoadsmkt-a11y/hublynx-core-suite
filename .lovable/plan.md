# Integração Google — refeita com login único

Objetivo: um só botão "Entrar com Google" que autentica o usuário no Hublynx e, na mesma sequência, libera Gmail, Google Agenda, Google Drive e Google Planilhas para aquela conta. Nada de colar chaves de API.

## O que muda para o usuário

1. **Tela de login (`/auth`)**: passa a ter o botão "Entrar com Google" ao lado do e-mail/senha atual.
2. **Configurações → Integrações**: card único "Conta Google" com um botão grande de conectar. Depois de conectado, mostra o e-mail da conta, o status de cada serviço (Gmail, Agenda, Drive, Planilhas) e um botão "Desconectar".
3. **Autorização em sequência**: ao clicar em conectar, abre a janela do Google e o usuário aprova os quatro serviços em sequência automática (sem clicar em quatro botões diferentes). Se o pop-up for bloqueado, o fluxo continua na mesma aba.
4. **Logs** continuam registrando cada tentativa (serviço, status, mensagem, data) para diagnóstico.

## Pré-requisito obrigatório

Existe um bloqueio hoje: nenhum cliente OAuth do Google está vinculado a este workspace (o projeto foi movido de workspace), por isso aparece o aviso "Cliente OAuth do Google ainda não aprovado". Ao executar o plano, vou abrir os cards de aprovação do conector — é preciso aprovar Gmail, Calendar, Drive e Sheets (um mesmo cliente OAuth do Google atende os quatro). Sem essa aprovação, o botão continua sem funcionar, independentemente do código.

## Detalhes técnicos

- **Vincular clientes**: `connector_app_user--connect_client` para `google_mail`, `google_calendar`, `google_drive`, `google_sheets`. Isso injeta `*_APP_USER_CONNECTOR_CLIENT_API_KEY` no ambiente do servidor.
- **Login social**: habilitar o provedor Google gerenciado (`configure_social_auth`) e usar `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })` no `/auth`. O e-mail/senha continua ativo.
- **Conexão por usuário** (mantém a base já existente):
  - `src/lib/google/app-user.functions.ts`: reescrito para uma API enxuta — `startGoogleConnect(service)`, `completeGoogleConnect(code)`, `getGoogleStatus()`, `disconnectGoogle(service)`. Escopos completos passados em `credentialsConfiguration.scopes` (userinfo.email, userinfo.profile + gmail.send, calendar.events, drive.file, spreadsheets).
  - `src/server/appUserConnections.server.ts` e `connectionKeyCrypto.ts`: mantidos (chave `lovack_*` cifrada na tabela `app_user_connections`).
  - `src/routes/oauth.google.return.tsx`: mantém o retorno, mas o code é trocado pelo opener; ao terminar um serviço, avança para o próximo da fila automaticamente.
- **Chamadas ao Google**: `callAsAppUser` com a chave do usuário logado, em todos os pontos que hoje usam variáveis de workspace:
  - `src/lib/pipeline/lead-email.functions.ts` e `gmail.functions.ts` (envio de e-mail do lead → `google_mail`)
  - `src/lib/google/calendar.functions.ts` e `lead-calendar.server.ts` (agenda/Meet → `google_calendar`)
  - `src/lib/google/sheets-sync.functions.ts` (planilhas → `google_sheets`)
  - documentos de cliente (Drive → `google_drive`)
- **Remoção do modo API key**: `src/lib/google/google.functions.ts` deixa de usar `GOOGLE_*_API_KEY` do workspace; passa a resolver a conexão do usuário autenticado. Remetente do e-mail deixa de ser fixo (`hublynx.dev@gmail.com`) e passa a ser a conta Google do usuário.
- **UI**: `src/components/google/GoogleConnectionCard.tsx` simplificado (um botão + status por serviço); `TestEmailCard` mantido como teste rápido.

## Fora do escopo

Sem mudanças no banco além do que já existe, sem alterar webhooks, pipeline ou demais módulos.
