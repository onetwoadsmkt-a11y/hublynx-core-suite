# Revisão do fluxo de adicionar tarefas

Todas as telas usam a mesma janela "Nova tarefa": Agenda, Tarefas, app do celular, card do lead e botão "Nova tarefa" do projeto. A revisão cobre esses cinco caminhos.

## O que vou conferir e corrigir

1. **Salvar sem empresa ativa**: hoje, se a empresa ainda não carregou, a tarefa é gravada sem empresa e some da Agenda. Vou bloquear o botão "Criar" até a empresa carregar e mostrar um aviso.
2. **Tarefa de projeto**: confirmar que ela entra no fim da etapa escolhida, com projeto e cliente preenchidos, e aparece nas Etapas, na Agenda e em Tarefas sem precisar recarregar a página.
3. **Agendamento do lead**: confirmar que aparece no card do lead, na Agenda e em Tarefas, e que uma falha no Google Agenda avisa sem perder o agendamento.
4. **Responsável e checklist**: se o checklist falhar, a tarefa já criada continua e aparece um aviso. Vou conferir se o responsável recebe o aviso no sino.
5. **Campos obrigatórios**: título e data são obrigatórios, e hora também para Reunião e Ligação. Vou mostrar o motivo quando o botão estiver desativado, em vez de só deixá-lo apagado.
6. **Duplo clique**: impedir que a tarefa seja criada duas vezes enquanto está salvando.

## Testes
- Testes automáticos para as regras de envio (campos obrigatórios e empresa ativa).
- Teste na tela de cada caminho. Criar uma tarefa de verdade depende de login, então vou dizer o que não consegui conferir.

## Detalhes técnicos
- `TaskCreateDialog.tsx`: adicionar `activeOrganizationId` em `canSubmit` e travar com `create.isPending`. Também usar a mesma fonte do projeto (`defaults.projectId`) para a etapa e o `project_id`.
- Extrair a regra de envio para uma função pura com teste ao lado.
- Conferir as invalidações (`invalidatePendingQueries`, `project-stage-tasks`, `lead-detail`).
