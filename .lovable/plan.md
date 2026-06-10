## Migrar para Connectors Padrão da Lovable

Vamos abandonar o fluxo per-user (App User Connector + OAuth próprio) e usar os **connectors padrão** da Lovable. Você conecta `hublynx.dev@gmail.com` **uma vez** no workspace e todos os usuários do Hublynx operam sobre essa mesma conta Google (Gmail, Drive, Calendar, Sheets e todas as funcionalidades disponiveis).

### O que muda na prática

- Não precisamos mais de Google Cloud Console, OAuth próprio, nem do secret `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID`.
- A "conexão Google" deixa de ser por-usuário e passa a ser **da agência**: e-mails saem de `hublynx.dev@gmail.com`, eventos vão no calendar dessa conta, arquivos no Drive dela, etc.
- A tabela `user_google_connections` deixa de fazer sentido (pode ser removida ou apenas ignorada).
- A tela "Configurações → Integrações" muda: em vez de "Conectar Google" por usuário, mostra o **status global** da conexão da workspace (conectado como `hublynx.dev@gmail.com` ✓) — quem conecta de verdade é você, via prompt do Lovable.

### Etapas

1. **Conectar os 4 connectors no workspace** (você autentica `hublynx.dev@gmail.com`):
  - `google_mail`
  - `google_drive`
  - `google_calendar`
  - `google_sheets`
   Eu disparo o prompt de conexão para cada um; você clica e autoriza.
2. **Refatorar `src/lib/google/**` para chamar o gateway direto:
  ```text
   https://connector-gateway.lovable.dev/{connector_id}/...
   Authorization: Bearer ${LOVABLE_API_KEY}
   X-Connection-Api-Key: ${GOOGLE_MAIL_API_KEY | GOOGLE_DRIVE_API_KEY | ...}
  ```
   Remover `appUserConnector.ts`, `appUserConnectorClient.ts`, `startGoogleConnect`, `saveGoogleConnection`, `disconnectGoogle`.
3. **Atualizar a UI** (`GoogleConnectionCard`):
  - Tira botão "Conectar Google" do usuário final.
  - Mostra status global: "Conectado como [hublynx.dev@gmail.com](mailto:hublynx.dev@gmail.com)" + lista de serviços ativos (Gmail, Drive, Calendar, Sheets) com check verde quando cada connector tem secret presente.
  - Adiciona aviso: "Esta conexão é compartilhada pela equipe Hublynx."
4. **Limpar banco** — migration que dropa `user_google_connections` (não é mais usada).
5. **Implementar as functions de fato** (próxima fase, depois de validar conexão):
  - `gmail.functions.ts` — listThreads, getMessage, sendEmail
  - `drive.functions.ts` — listFiles, getFileUrl
  - `calendar.functions.ts` — listEvents, createEvent
  - `sheets.functions.ts` — exportToSheet
  - Integrar nos módulos Agenda, Arquivos, Clientes, Relatórios (conforme plano original).

### Detalhes técnicos

- Cada connector vira um secret runtime separado (`GOOGLE_MAIL_API_KEY`, `GOOGLE_DRIVE_API_KEY`, etc.) — lidos em server functions via `process.env`.
- `LOVABLE_API_KEY` (já existe) autentica no gateway; o `X-Connection-Api-Key` específico identifica qual conta usar.
- Server functions continuam protegidas por `requireSupabaseAuth` (só usuários logados no Hublynx podem disparar chamadas), mas a conta Google subjacente é única.
- Sem refresh token manual: o gateway gerencia tokens automaticamente.

### O que você precisa fazer

- Aprovar este plano.
- Quando eu disparar os 4 prompts de conexão, fazer login com `hublynx.dev@gmail.com` e autorizar os escopos pedidos em cada um.

### Riscos / observações

- **Privacidade**: como a conta é única, qualquer usuário do Hublynx que dispare "enviar e-mail" estará mandando como `hublynx.dev@gmail.com`. Se algum dia quiser separar por usuário, voltamos para o fluxo per-user OAuth.
- O `Gmail` connector tem matriz de escopos: para marcar como lido, arquivar, etc. precisa `gmail.modify` — confirmo isso no momento de conectar.
- Migration que dropa `user_google_connections` é destrutiva; se tiver dados úteis ali, me avisa antes que eu mantenho a tabela.