## Task Details Center — Hublynx Core

Transformar o módulo Tarefas em uma central operacional completa via drawer lateral (~720px) com todas as 14 seções pedidas.

---

### Banco de dados (1 migration única)

**Enum de status — migração para 5 valores**

```text
backlog | a_fazer | em_andamento | revisao | concluido
```

Mapa de migração dos status atuais:
- `planejado` → `a_fazer`
- `aguardando_cliente` → `em_andamento` (já que "Aguardando cliente" some)
- `cancelado` → `backlog` (sem equivalente; vira backlog)
- Demais mantêm

**Colunas novas em `public.tasks`**
- `created_by uuid` (auto = owner_id em tasks antigas)
- `completed_at timestamptz null`
- `estimated_hours numeric null`
- `actual_hours numeric null`
- `internal_notes text null` (rich text HTML)
- `briefing jsonb null` (`{objective, audience, references, competitors, restrictions, deliverables}` — cada campo HTML)

**Tabelas novas (todas com RLS por `owner_id = auth.uid()` e GRANT padrão)**
- `task_labels` — catálogo de labels do usuário (`id, owner_id, name, color`)
- `task_label_assignments` — N:N (`task_id, label_id, owner_id`, PK composta)
- `task_attachments` — metadados de Storage (`id, task_id, owner_id, name, size, mime, storage_path, uploaded_at`)
- `task_history` — log automático (`id, task_id, owner_id, actor_id, action, field, old_value, new_value, created_at`)
- `task_custom_fields` — definições (`id, owner_id, key, label, type ∈ {text,number,date,select,url}, options jsonb, position`)
- `task_custom_values` — valores por tarefa (`id, task_id, field_id, owner_id, value text`)
- `task_related` — recursos relacionados (`id, task_id, owner_id, resource_type ∈ {task,project,client,event,file}, resource_id`)
- `task_comments` extras: adicionar `parent_id uuid null` (replies) e `mentions uuid[] default '{}'`

**Storage**
- Bucket privado `task-attachments`, paths `{owner_id}/{task_id}/{uuid}-{filename}`
- Políticas: SELECT/INSERT/UPDATE/DELETE somente quando o `name` começa com `auth.uid()::text || '/'`

**Trigger de histórico**
- `tg_tasks_history` em `public.tasks` (AFTER INSERT/UPDATE/DELETE): grava 1 linha em `task_history` por campo alterado dentre status, priority, assignee_id, project_id, client_id, due_date, title.
- Trigger separado para checklist/attachments/comments emitindo `action` ('checklist_added', 'file_uploaded', 'comment_added', etc.).

**Notificações automáticas (triggers)**
- Em `tasks`: AFTER UPDATE de `assignee_id` → INSERT em `notifications` para o novo responsável.
- Em `tasks`: AFTER UPDATE de `status` para `concluido` → notifica `created_by` (se diferente).
- Em `task_comments`: para cada uid em `mentions` → notifica.
- Cron diário (pg_cron) — fora do escopo desta rodada (deixar TODO; estrutura suporta).

---

### Frontend

**Estrutura de arquivos**
```text
src/routes/_authenticated/tarefas.tsx       # Kanban+Lista (já existe, refatorar)
src/components/tasks/
  TaskDrawer.tsx                # Drawer 720px, sticky header
  TaskHeader.tsx                # Título inline, status, prioridade, ações
  tabs/
    OverviewTab.tsx             # Geral + Cliente + Projeto + Tempo + Labels
    BriefingTab.tsx             # Briefing (6 campos rich text)
    NotesTab.tsx                # Notas internas (rich text + autosave)
    ChecklistTab.tsx            # Checklist com drag-reorder e barra de progresso
    AttachmentsTab.tsx          # Upload, preview, download, delete
    CommentsTab.tsx             # Feed rich text + @menções + replies
    HistoryTab.tsx              # Timeline de task_history
    RelatedTab.tsx              # Recursos relacionados + custom fields
  LabelPicker.tsx               # Multi-select com cores
  RichTextEditor.tsx            # Tiptap wrapper (negrito, listas, links, mention)
src/lib/tasks/
  api.ts                        # queries/mutations centralizadas
  history.ts                    # helper para registrar ações app-side se necessário
```

**Dependências novas**
- `@tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-mention @tiptap/extension-placeholder tippy.js` — editor rico e menções
- `react-dropzone` — upload drag-and-drop
- Já existem: dnd-kit, date-fns, recharts, sonner

**Drawer (720px)**
- Header sticky: título editável inline, badge de status, badge de prioridade, menu de ações (duplicar, arquivar, excluir), botão de fechar
- Action bar sticky no rodapé com "Salvar" só aparece se houver edição pendente (autosave por padrão)
- Abas no topo: **Geral · Briefing · Notas · Checklist · Anexos · Comentários · Histórico · Relacionados**

**Comentários (rich text + menções + replies)**
- Tiptap com `@tiptap/extension-mention`; lista de sugestões busca usuários via `profiles` (hoje só o próprio usuário; preparado para multiusuário futuro)
- `parent_id` permite responder; UI mostra thread indentada (1 nível)
- Menções gravam uuids em `mentions[]`; trigger no banco emite notificação

**Custom fields**
- Em **Configurações → Tarefas** (nova subpágina), CRUD dos campos
- No drawer, aba Relacionados renderiza dinamicamente os campos definidos

**Notificações UI**
- Sino no header do `AppShell` (já existe) → popover lista `notifications` não lidas, marca como lida ao clicar

**Filtros do Kanban/Lista**
- Adicionar filtro por label, responsável, e quick-filter "minhas tarefas"

---

### UX
- Fundo branco, cards arredondados (`rounded-xl`), sombras `var(--shadow-soft)`
- Drawer com transição suave, fecha em ESC/overlay
- Skeletons em cada aba para evitar piscadas
- Toasts via sonner para todas as mutations
- Responsivo: drawer vira full-screen sheet em < lg

---

### Entregas em ordem
1. Migration única (enum, colunas, novas tabelas, GRANTs, RLS, triggers, bucket + policies de Storage)
2. Refatoração do `tarefas.tsx` para abrir o novo `TaskDrawer`
3. Componente `TaskDrawer` + 8 abas
4. Editor rico (Tiptap) + uploads (Storage) + label picker
5. Página `Configurações → Campos personalizados`
6. Sino de notificações no AppShell ligado à tabela `notifications`

---

### Detalhes técnicos (para revisão)

**Validação**
- Zod em todos os formulários (título 1–200, descrição até 5k, briefing por campo até 10k, comentário até 5k, label name até 40)
- Upload limitado a 20 MB por arquivo, lista branca de mime (`pdf, docx, xlsx, png, jpg, jpeg, zip`)

**Performance**
- React Query com `staleTime` 30s em listas de tarefas; queries do drawer com keys por `task_id`
- Optimistic updates em status/prioridade/checklist
- Histórico paginado (50 por página)

**Risco mitigado**
- Migração de status: backup implícito via DEFAULT na coluna antiga antes do `ALTER TYPE`. Vou usar `CREATE TYPE task_status_new`, `UPDATE` com cast manual via CASE, `DROP TYPE`, `RENAME`.
- Triggers de histórico ignoram updates onde nenhum campo monitorado mudou (para não poluir).
