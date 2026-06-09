## Integração Google por usuário — Hublynx Core

Cada usuário do Hublynx conecta a própria conta Google. Usaremos **App User Connector** da Lovable: um único OAuth na família `google` libera Gmail + Drive + Calendar + Sheets para aquele usuário.

---

### 1. Pré-requisito (você faz no Google Cloud, 1x)

Para OAuth por-usuário, é necessário criar credenciais OAuth próprias:

1. Google Cloud Console → criar projeto (ou usar existente)
2. **APIs & Services → Library** → habilitar: Gmail API, Google Drive API, Google Calendar API, Google Sheets API
3. **OAuth consent screen** → External, adicionar domínios `*.lovable.app` e seu domínio custom
4. **Credentials → Create OAuth client ID → Web application**
   - Authorized redirect URI: `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback`
5. Copiar **Client ID** + **Client Secret**

Quando estiver pronto, eu peço o secret `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID` (e o secret correspondente que a Lovable usa internamente — explico no momento).

---

### 2. Banco

Tabela única `user_google_connections`:
```text
id, user_id, connection_api_key (lovack_*), email, scopes[], connected_at
UNIQUE(user_id)  -- 1 conta Google por usuário
```
RLS: dono lê/escreve apenas a sua. Grants padrão.

---

### 3. Arquivos novos

```text
src/integrations/lovable/appUserConnector.ts         # server-only (gateway calls)
src/integrations/lovable/appUserConnectorClient.ts   # client-safe (popup helper)
src/lib/google/google.functions.ts                   # startGoogleConnect, saveConnection, listConnection, disconnect
src/lib/google/gmail.functions.ts                    # listThreads, getMessage, sendEmail
src/lib/google/drive.functions.ts                    # listFiles, searchFiles, getFileUrl
src/lib/google/calendar.functions.ts                 # listEvents, createEvent, updateEvent
src/lib/google/sheets.functions.ts                   # exportToSheet, listSpreadsheets
src/components/google/GoogleConnectButton.tsx        # botão "Conectar Google" (popup)
src/components/google/GoogleConnectionCard.tsx       # status + desconectar
```

### 4. UI por módulo

- **Configurações → Integrações** (nova aba): card "Google Workspace" mostra status (conectado como `email@x.com` ou "Conectar"), lista escopos, botão Desconectar.
- **Agenda**: se conectado, mostra eventos do Google Calendar lado a lado com eventos internos; botão "Criar no Google Calendar" ao salvar evento.
- **Arquivos**: aba "Google Drive" lista arquivos do usuário; em Clientes/Projetos/Tarefas, botão "Anexar do Drive" abre picker.
- **Clientes/Projetos** (detalhe): aba "E-mails" — lista threads do Gmail filtradas por domínio/email do cliente; botão "Enviar e-mail".
- **Relatórios**: botão "Exportar para Google Sheets" cria planilha com os dados do relatório atual.

### 5. Fluxo OAuth (popup, funciona no preview)

1. Usuário clica "Conectar Google" → server fn `startGoogleConnect` chama `authorizeAppUserOAuth` com `connector_id: "google"`, todos os 4 escopos, `responseMode: "web_message"`
2. Popup abre, usuário consente
3. Gateway posta `lovack_*` de volta via `postMessage`
4. Client chama `saveGoogleConnection` → grava em `user_google_connections`
5. Próximas chamadas usam `callAsAppUser({ connectorId: "google_mail" | "google_drive" | "google_calendar" | "google_sheets", connectionAPIKey })`

### 6. Escopos solicitados

```text
gmail.readonly, gmail.send,
drive.readonly, drive.file,
calendar, calendar.events,
spreadsheets, drive.file
```

---

### Entregas em ordem

1. Migration `user_google_connections` (tabela + RLS + grants)
2. Helpers `appUserConnector.ts` + `appUserConnectorClient.ts`
3. `google.functions.ts` (connect/save/list/disconnect)
4. Nova rota `Configurações → Integrações` com card Google + botão conectar/desconectar
5. **PAUSA** — peço o `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID` e validamos o fluxo OAuth end-to-end
6. Após validado: gmail/drive/calendar/sheets functions + integração nos módulos (Agenda, Arquivos, Clientes, Relatórios)

---

### Riscos e notas

- Se um escopo faltar, a API retorna 403 → trato com `reconnect` automático.
- O `lovack_*` é por-usuário e por-família Google: 1 chave serve Gmail/Drive/Calendar/Sheets.
- Tokens são gerenciados pela Lovable (refresh automático), não preciso armazenar refresh_token.
- Sem credenciais OAuth próprias do Google Cloud, **não é possível** fazer per-user OAuth — connectors padrão da Lovable autenticam só a sua conta (modo workspace), não a de cada usuário.

Quer que eu prossiga com o passo 1 (migration + helpers + UI de conexão) e pause antes de pedir o secret?
