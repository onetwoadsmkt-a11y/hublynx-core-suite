## Mudança

No cabeçalho do projeto (`src/routes/_authenticated/projetos.$id.tsx`, linhas 255–262), remover o bloco "Progresso geral" (barra + "X de Y tarefas concluídas") e colocar no lugar um botão **"Criar tarefa"** (ícone Plus) como ação rápida.

## Comportamento

- Clicar no botão abre um **Sheet lateral à direita** (mesmo padrão do `TaskDrawer`), sem sair de `/projetos/$id`.
- O formulário é o mesmo do `NewTaskDialog` de `src/routes/_authenticated/tarefas.tsx` (título, descrição, prioridade, status, projeto, cliente, prazo), reaproveitado.
- O campo **Projeto vem pré-selecionado e travado** com o projeto atual (`p.id`); cliente também pré-preenche com `p.client?.id` quando existir.
- Ao salvar: invalida `["project-detail", id]` e `["tasks"]` para o KPI/Roadmap/Kanban do projeto atualizarem na hora, mostra toast e fecha o drawer.

## Implementação técnica

1. Extrair o corpo do `NewTaskDialog` para um componente reutilizável `NewTaskForm` em `src/components/tasks/NewTaskForm.tsx` recebendo `{ defaultProjectId?, defaultClientId?, lockProject?, onCreated }`. Manter o uso atual em `tarefas.tsx` apontando para ele.
2. Criar `src/components/tasks/NewTaskSheet.tsx` que envolve `NewTaskForm` em `<Sheet side="right">` (largura ~480px), idêntico ao estilo do `TaskDrawer`.
3. Em `projetos.$id.tsx`:
   - Substituir o bloco `w-full sm:w-64 shrink-0` (linhas 255–262) por `<Button onClick={() => setNewTaskOpen(true)}><Plus/> Criar tarefa</Button>`.
   - Adicionar estado `newTaskOpen` e render `<NewTaskSheet open={newTaskOpen} onOpenChange={setNewTaskOpen} defaultProjectId={p.id} defaultClientId={p.client?.id} lockProject />`.
   - Listas de projetos/clientes para os selects: buscar via os mesmos servidores já usados na página de tarefas (ou passar só os necessários — projeto travado dispensa a lista).

## Fora do escopo

- Não alterar a lógica de cálculo de progresso (segue disponível nos KPIs/roadmap mais abaixo na página).
- Não mexer no `TaskDrawer` existente.
