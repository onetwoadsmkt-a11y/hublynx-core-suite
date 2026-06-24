
# Central de Tarefas — Redesign + PWA dedicado

Ajusta a etapa **Tarefas** do sistema com o layout mobile-first descrito e cria um **PWA instalável separado** apontando só para essa área, mantendo a identidade visual do Hublynx Core.

## 1. Nova rota base `/app` (shell mobile)

Cria um layout próprio em `src/routes/_authenticated/app.tsx` (sem sidebar do Core), com:
- Header compacto (saudação + data + sino).
- `<Outlet />` central com padding bottom para a bottom bar.
- **Bottom bar fixa** com 5 itens: Hoje · Tarefas · **Novo (+)** central destacado · Projetos · Mais.
- Botão **Novo** abre bottom-sheet com 4 ações: Nova tarefa · Novo projeto · Novo cliente · Novo lembrete.

Rotas filhas:
- `/app/hoje` — saudação, card da próxima tarefa, contadores (pendentes / atrasadas / concluídas), lista do dia com botões "Ver" e "Concluir".
- `/app/tarefas` — busca + filtros chips (Hoje, Atrasadas, Pendentes, Concluídas) + cards.
- `/app/tarefas/$id` — detalhe (status, prazo, responsável, projeto, descrição, checklist, anexos, comentários, botão Concluir).
- `/app/projetos` — cards com contadores de tarefas (abertas / concluídas / atrasadas).
- `/app/projetos/$id` — tarefas relacionadas.
- `/app/lembretes` — lista + criação (No horário, 1h antes, 1 dia antes, semanal, mensal).
- `/app/mais` — Clientes, Equipe, Etiquetas, Modelos, Configurações, status offline.

Reaproveita os componentes existentes (`NewTaskSheet`, `TaskDrawer`, `useKanbanColumns`, mutations Supabase) — só envolvendo em layouts mobile novos. Sem refazer business logic.

## 2. Ajuste da etapa Tarefas atual no sistema

`/tarefas` (desktop, dentro do AppShell) ganha o mesmo visual de cards arredondados, chips de filtro e header de resumo do dia, mantendo o Kanban existente como uma das views (toggle Lista / Kanban). Identidade visual: tokens já definidos em `src/styles.css` (verde `#00D084`, dark Hublynx) — sem cores hardcoded.

Nova tarefa rápida: campo único "O que precisa ser feito?", chips de prazo (Hoje / Amanhã / Esta semana / Sem prazo), prioridade (Normal / Importante / Urgente), projeto/cliente, responsável. Reusa a mutation atual do `NewTaskSheet`.

## 3. PWA instalável só da Central de Tarefas

- Novo manifest `public/manifest-tarefas.webmanifest`:
  - `name`: "Hublynx Tarefas", `short_name`: "Tarefas"
  - `start_url`: `/app/hoje`
  - `scope`: `/app/`
  - `display`: `standalone`, theme/background com tokens Hublynx
  - Ícones próprios (gerar `public/icon-tarefas-192.png` / `512.png`).
- `<link rel="manifest" href="/manifest-tarefas.webmanifest">` injetado **apenas** quando a rota começa com `/app` (via `head()` no layout `app.tsx`), para não conflitar com o manifest do Core.
- Botão "Instalar app" no `/app/mais` usando o evento `beforeinstallprompt`.
- O manifest `/app/` mantém o usuário dentro da Central; ao abrir links externos do Core, sai do escopo normalmente.

## 4. Push notifications nativas (PWA)

- Tabela nova `push_subscriptions` (user_id, endpoint, p256dh, auth, created_at) com RLS por `auth.uid()` + GRANTs.
- Service worker `public/sw-push.js` apenas para push (não cacheia app shell — respeita guideline PWA do Lovable preview).
- Server fns:
  - `subscribeToPush` — salva subscription do navegador.
  - `sendPushToUser` — envia via `web-push` com chaves VAPID.
- Secrets via `generate_secret`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (gerados automaticamente).
- Cron `pg_cron` a cada minuto chama `/api/public/hooks/run-reminders` que varre `tasks` com `due_date` próximo conforme regra do lembrete (no horário, 1h antes, 1 dia antes) e dispara push + atualiza last_sent.
- Lembretes recorrentes (semanal/mensal) tratados pelo mesmo cron olhando regra em `briefing.reminder`.

## 5. Sincronização automática com Google Calendar

Já existe `syncTaskToCalendar` e `syncAllPendingTasksToCalendar`. Reforço:
- Chamar `syncTaskToCalendar` em **toda** criação/edição de tarefa com `due_date` (não só pela tela de agenda).
- Em concluir tarefa: atualiza o evento Google (marca `[Concluída]` no título e status).
- Garantir idempotência (já implementado via `task_communications`).

## Arquivos novos

- `src/routes/_authenticated/app.tsx` (layout mobile)
- `src/routes/_authenticated/app.hoje.tsx`
- `src/routes/_authenticated/app.tarefas.tsx`
- `src/routes/_authenticated/app.tarefas.$id.tsx`
- `src/routes/_authenticated/app.projetos.tsx`
- `src/routes/_authenticated/app.projetos.$id.tsx`
- `src/routes/_authenticated/app.lembretes.tsx`
- `src/routes/_authenticated/app.mais.tsx`
- `src/components/app-mobile/BottomBar.tsx`
- `src/components/app-mobile/NewActionSheet.tsx`
- `src/components/app-mobile/TaskCardMobile.tsx`
- `src/components/app-mobile/InstallPWAButton.tsx`
- `src/lib/push/push.functions.ts`
- `src/routes/api/public/hooks/run-reminders.ts`
- `public/manifest-tarefas.webmanifest`
- `public/sw-push.js`
- `public/icon-tarefas-192.png`, `public/icon-tarefas-512.png`

## Arquivos editados

- `src/routes/_authenticated/tarefas.tsx` — novo visual + filtros chips + view toggle.
- `src/components/tasks/NewTaskSheet.tsx` — chips rápidos de prazo + simplificação mobile.
- `src/routes/__root.tsx` — registrar `sw-push.js` (não app-shell SW).

## Migrations

```sql
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;
create policy "own_push" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Coluna opcional em `tasks.briefing` (JSONB já existe) guarda `reminder: { rule, last_sent_at }`.

## Pontos confirmados pelo usuário

- Sem onboarding — usa sessão já existente.
- Sem seed de dados — usa os clientes/projetos/tarefas já cadastrados.
- Lembretes via Web Push nativo do PWA (pedirá permissão no celular).
- Manter sistema desktop intacto, apenas modernizar /tarefas e adicionar PWA dedicado em /app.
