# Plano — Módulo Agenda (Hublynx Core)

Substituir o placeholder atual de `/agenda` por um Command Center de calendário minimalista (estilo Linear/Notion) que unifica **Tarefas**, **Clientes** e **Google Calendar**, com três visualizações (Dia / Semana / Mês) e sincronização em tempo real.

## 1. Fontes de dados unificadas

Server function `getAgendaEvents({ from, to })` em `src/lib/agenda/agenda.functions.ts` que retorna um array normalizado `AgendaEvent`:

```
{ id, source: 'task' | 'meeting' | 'gcal' | 'client',
  title, start, end?, allDay,
  taskId?, clientId?, clientName?, projectId?,
  meetLink?, htmlLink?, color, status }
```

Combina três origens:
- **Tasks** (`tasks` com `due_date` no intervalo) → vincula `client_id` / `project_id`.
- **Reuniões internas** (`task_communications` kind=`meeting` com `start_at`) → já trazem `meet_link`.
- **Google Calendar** (`/calendars/primary/events?timeMin=&timeMax=&singleEvents=true`) via gateway, reaproveitando `getGoogleGatewayHeaders('calendar')` de `google.functions.ts`. Se a conta Google não estiver conectada, ignora silenciosamente esta fonte.

## 2. Página `/agenda` (substitui o placeholder)

`src/routes/_authenticated/agenda.tsx`:
- Header executivo: título, navegação `‹ Hoje ›`, label do período, switch **Dia / Semana / Mês** (Tabs), botão **Nova tarefa** e **Agendar reunião** (reutiliza `ScheduleMeetingDialog`).
- Filtros laterais compactos: cliente (select), origem (chips: Tarefas / Reuniões / Google), busca.
- URL como estado via `validateSearch` (`view`, `date`, `clientId`, `sources`) — navegação preserva contexto.
- Grid principal com 3 componentes:
  - `AgendaMonth` — grade 7×N, dots coloridos por origem, clique no dia → drill no Dia.
  - `AgendaWeek` — colunas por dia, faixa horária 6h–22h, eventos posicionados por hora.
  - `AgendaDay` — coluna única, timeline detalhada, painel lateral com "Próximos" e "Sem horário (all-day)".
- Cards arredondados, fundo branco, bordas suaves, cores semânticas por origem (tarefa = primary, reunião = accent, gcal = muted).
- Estados vazios curtos, skeletons durante load.

## 3. Tempo real

- TanStack Query (`['agenda', range, filters]`) com `ensureQueryData` no loader.
- Supabase Realtime: canal `agenda-live` ouvindo `postgres_changes` em `tasks` e `task_communications` (filtrado por `owner_id = userId`) → invalida a query.
- Google Calendar: polling leve a cada 60s via `refetchInterval` (Workers/Webhook push fica fora do escopo desta entrega) + refetch ao focar janela.
- Migração: `ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks, public.task_communications` (idempotente).

## 4. Ações rápidas no evento

- Clique em evento abre `Popover`:
  - Tarefa → "Abrir tarefa" (`/tarefas?task=<id>`), "Marcar concluída", "Reagendar" (date picker inline → server fn que atualiza `due_date`).
  - Reunião → "Entrar no Meet", "Copiar link", "Abrir tarefa".
  - GCal → "Abrir no Google", título/horário (read-only nesta etapa).
- Botão **Agendar reunião** abre `ScheduleMeetingDialog` desacoplado de uma task — adicionar prop opcional `standalone` para permitir escolher tarefa (autocomplete) antes de enviar.

## 5. Integração com módulos existentes

- Sem mexer em navegação atual; apenas troca o placeholder de Agenda.
- Reuso: `scheduleMeeting` (`calendar.functions.ts`), `ScheduleMeetingDialog`, `useKanbanColumns` não aplicável aqui.
- Tipos compartilhados em `src/lib/agenda/types.ts`.

## Detalhes técnicos

- Sem libs novas pesadas: grid próprio (CSS grid) — evita `react-big-calendar`. `date-fns` já presente.
- Server fn protegida com `requireSupabaseAuth`; chamada via `useServerFn` + `useQuery` (rota pública para SSR seguro).
- Tratamento de timezone: tudo em UTC no transporte, exibição com `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })`.
- Acessibilidade: navegação por teclado (←/→ muda período, D/S/M troca view).

## Arquivos

- `src/lib/agenda/agenda.functions.ts` (novo)
- `src/lib/agenda/types.ts` (novo)
- `src/components/agenda/AgendaHeader.tsx`, `AgendaMonth.tsx`, `AgendaWeek.tsx`, `AgendaDay.tsx`, `EventPopover.tsx` (novos)
- `src/routes/_authenticated/agenda.tsx` (substitui placeholder)
- Migração: habilitar Realtime em `tasks` e `task_communications`.

## Fora de escopo

- Criação/edição de eventos diretamente no Google Calendar (apenas leitura + criação via reunião com Meet, que já existe).
- Push notifications do GCal (watch channel) — fica para evolução futura; polling 60s atende o requisito de "tempo real" prático.
