## Objetivo

Redesenhar a aba **Kanban** em `/tarefas` para seguir o layout do pipeline anexado, **sem alterar identidade visual** (cores semânticas, fonte, tokens, botão verde `#00D084`, badges de tons existentes) nem regras de negócio. Apenas UI/layout do Kanban.

## Escopo

Arquivo único: `src/routes/_authenticated/tarefas.tsx` (componentes `KanbanColumn`, `TaskCard`/`DraggableCard`). Aba "Lista" e o `TaskDrawer` ficam intactos.

## Mudanças de layout

### 1. Cabeçalho da página (linha do "Pipeline - Tarefas")

- Manter título ("Editar Kanban", "Nova tarefa").
- Mover a busca e os filtros para a **mesma linha** do título (compactos, à direita), igual à barra do pipeline. Em telas estreitas, quebram para baixo.
- Adicionar à direita um contador resumo: `N tarefas` (similar a "6 leads: R$3.000"), usando apenas a contagem (sem valor monetário).

### 2. Coluna do Kanban

Cada coluna passa a ter:

- **Borda superior colorida** (faixa 3px) usando a cor atual do `col.tone` (extrair a cor do tom — ex.: `bg-blue-100 text-blue-700` → faixa `bg-blue-500`). Mapa simples de tom→accent dentro do arquivo.
- Cabeçalho com:
  - Título da coluna em **maiúsculas, peso semibold, cor neutra** (sem o "pill" colorido atual).
  - Botão `+` à direita (ghost icon) que abre o `NewTaskDialog` já com `status` pré-selecionado da coluna.
  - Sublinha com `{count} tarefas` em `text-muted-foreground`.
- Fundo da coluna mais sutil: `bg-card` com `border` em vez de `bg-muted/40`.
- Largura mantém `w-80`, scroll horizontal mantém.
- **Placeholder quando vazia**: caixa tracejada centralizada com texto "Arraste tarefas aqui" (substitui o vazio atual).

### 3. Card de tarefa

Reformatar para o visual do print:

- Linha 1: **círculo avatar** (ícone `User` em cinza dentro de um círculo `bg-muted`) + **título** em bold + **data** (`dd/MM`) no canto superior direito.
- Linha 2 (se houver cliente): ícone `Mail` + email do cliente, em `text-sm text-brand-blue`.
- Linha 3 (se houver cliente com telefone): ícone `Phone` + telefone — só renderiza se existir; (manter como hoje se não tivermos telefone na query, neste caso omitir).
- Linha 4: **chips de labels** (mantém cores das labels atuais) + ponto de prioridade (bolinha pequena com cor de `PRIORITY_ACCENT`) alinhado à direita.
- Remover a barra-accent vertical à esquerda atual; o destaque visual vem do topo da coluna.
- Borda do card: `border bg-card rounded-lg shadow-sm hover:shadow-md`.

### 4. Não alterar

- Schema do banco, queries, mutations, drag-and-drop (dnd-kit), filtros, `TaskDrawer`, aba Lista, `EditKanbanDialog`, `NewTaskDialog`.
- Tokens de cor e classes semânticas. Nenhum `text-white`/`bg-black` hardcoded novo.
- Cores das colunas continuam vindo de `kanban_columns.tone`.

## Detalhes técnicos

- Mapa `TONE_TO_ACCENT` local em `tarefas.tsx`:
  ```
  "bg-blue-100 text-blue-700" → "bg-blue-500"
  "bg-amber-100 text-amber-700" → "bg-amber-500"
  ... (cobrir os 10 tons de KANBAN_TONES)
  default → "bg-muted-foreground/40"
  ```
- `KanbanColumn` recebe nova prop `onAddInColumn(statusKey)` para abrir o `NewTaskDialog` pré-preenchido. Implementar lift state mínimo no `TarefasPage` (`newTaskStatus`) e passar para `NewTaskDialog` como prop opcional `defaultStatus`.
- `TaskCard` ganha sub-componentes `CardHeader` (avatar+título+data) e `CardContact` (email).

## Fora do escopo

- Toolbar flutuante inferior do print (ícones de seleção/texto/anexar/comentar) — não corresponde a nenhuma feature atual; será ignorada.
- Webhook/Testar do print — não existem em Tarefas.