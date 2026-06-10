# Integração Google Meet + Ações Google no Card de Tarefa

## 1. Novo layout do card (Kanban)

Redesenho do `TaskCard` em `src/routes/_authenticated/tarefas.tsx`:

```
┌──────────────────────────────────────┐
│ ▓▓▓ stripe colorido (prioridade)     │  ← capa
│ [etiqueta1] [etiqueta2]    ⏰ 15/06 │  ← header: labels esq. / prazo dir.
│                                       │
│  Revisar campanha de junho            │  ← título (nome da tarefa)
│  Cliente: Acme Ltda                   │  ← subtítulo (nome do cliente)
│                                       │
│  [✉ Email] [📅 Agendar] [🎥 Meet]    │  ← ações Google
└──────────────────────────────────────┘
```

- Prazo no canto superior direito com destaque (badge tabular, vermelho se vencido, âmbar se ≤ 2 dias).
- Etiquetas no cabeçalho.
- Título = tarefa, subtítulo = nome do cliente vinculado (resolvido via `client_id`).
- Três botões compactos no rodapé, desabilitados quando não houver cliente com email (Email/Meet com convite).

## 2. Ações Google (todas dentro do sistema)

Todas via gateway `connector-gateway.lovable.dev` em `createServerFn` com `requireSupabaseAuth`, usando os connectors já linkados (hublynx.dev@gmail.com).

### a. Enviar email (Gmail)
- Botão abre modal `SendEmailDialog`:
  - **Para**: pré-preenchido com `clients.email`, editável, múltiplos destinatários
  - **Assunto**, **Mensagem** (textarea simples; HTML básico)
  - Botão "Enviar"
- Server fn `sendTaskEmail`: monta RFC 2822, base64url, POST `users/me/messages/send` no gateway `google_mail`.
- Registra em `task_communications` (tipo `email`) com assunto, destinatário, snippet, message_id, timestamp.

### b. Agendar reunião (Calendar + Meet)
- Botão abre modal `ScheduleMeetingDialog`:
  - **Título** (default: título da tarefa), **Data/hora início**, **Duração** (15/30/45/60 min), **Descrição**, **Participantes** (chips, default = email do cliente), checkbox "Enviar convite por email".
  - Botão "Agendar".
- Server fn `scheduleMeeting`: POST `calendars/primary/events?conferenceDataVersion=1&sendUpdates=all` com `conferenceData.createRequest` para gerar link Meet.
- Registra em `task_communications` (tipo `meeting`) com link Meet, event_id, start_at, attendees.

### c. Link Meet rápido
- Botão "Meet agora": cria evento de 30 min começando agora, sem convites; copia o link para o clipboard e abre numa aba.
- Mesma server fn de agendar, com payload pré-montado.
- Opção extra dentro do modal de email: "Incluir link Meet" — se marcado, gera o evento e injeta o link no corpo do email antes de enviar.

## 3. Timeline no TaskDrawer

Nova aba "Comunicações" em `TaskDrawer` mostrando entradas de `task_communications` ordenadas por data desc:
- Email: ícone ✉, "Para X · Assunto" · timestamp · expandir para ver snippet
- Meeting: ícone 🎥, "Reunião com X · DD/MM HH:mm" · botão "Abrir Meet" · botão "Copiar link"

## 4. Schema (migration)

Tabela nova `task_communications`:
- `id`, `task_id` (FK tasks), `owner_id`, `actor_id`, `kind` ('email'|'meeting'), `subject`, `recipients text[]`, `body_snippet`, `provider_id` (message_id/event_id), `meet_link`, `start_at`, `metadata jsonb`, `created_at`.
- RLS: dono da tarefa pode ler/inserir; trigger registra `task_history` (opcional).
- GRANTs: authenticated CRUD, service_role ALL.

## 5. Arquivos

**Migration**
- `task_communications` + policies + grants

**Server functions** (`src/lib/google/`)
- `gmail.functions.ts` — `sendTaskEmail`
- `calendar.functions.ts` — `scheduleMeeting`, `createInstantMeet`
- `communications.functions.ts` — `listTaskCommunications`

**Componentes** (`src/components/tasks/`)
- `TaskCard.tsx` — extraído de `tarefas.tsx` com novo layout (título/subtítulo, prazo destacado, botões Google)
- `SendEmailDialog.tsx`
- `ScheduleMeetingDialog.tsx`
- `TaskCommunicationsTab.tsx` — adicionado ao `TaskDrawer`

**Edição**
- `tarefas.tsx` — usar novo `TaskCard`, passar `clientById` map
- `TaskDrawer.tsx` — nova tab "Comunicações"

## Notas técnicas

- Connectors compartilhados → todas as ações são enviadas a partir de `hublynx.dev@gmail.com`. O destinatário do email é o cliente; o "remetente visível" é a conta Hublynx.
- Validação Zod nos server fns (email válido, max lengths, datas futuras para agenda).
- Sem novos secrets necessários — `GOOGLE_MAIL_API_KEY`, `GOOGLE_CALENDAR_API_KEY` e `LOVABLE_API_KEY` já existem.
- O Drawer existente continua funcionando; apenas ganha uma aba a mais.