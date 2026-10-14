# Roadmap vertical no Core Suite

## Objetivo
Dentro do projeto, na aba de etapas, oferecer a visualização vertical como no portal do cliente. **Vertical será a opção inicial**, conforme escolhido, mantendo a alternativa horizontal.

## Alterações
- Acrescentar um seletor **Vertical / Horizontal**, com ícones, junto às ações do roadmap.
- Apresentar as etapas de cima para baixo, conectadas por uma linha do tempo, com nome, prazo, situação e progresso das tarefas de cada etapa.
- Manter o botão de tarefas de cada etapa abrindo o modal atual, com as mesmas ações de adicionar e concluir tarefas.
- Preservar a conclusão de etapas, edição e aplicação de modelos nas duas visualizações.
- Manter o progresso geral baseado nas etapas, sem substituí-lo pelo percentual das tarefas.
- Lembrar a visualização escolhida neste navegador, sem interferir na preferência do portal.
- Ajustar nomes longos, seletor e ações para caberem em telas menores.

## Detalhes técnicos
- Alteração de apresentação em `src/components/projects/RoadmapStages.tsx`, que hoje tem apenas o desenho horizontal.
- Usar o padrão visual vertical de `src/routes/portal.$projectId.tsx`, adaptado aos dados e ações internos, sem importar a página do portal.
- Reutilizar as consultas, percentuais e ações existentes; não alterar banco, permissões, funções de servidor, regras de tarefas nem o portal do cliente.
- Ler a preferência de visualização após a página carregar, iniciando em vertical.

## Conferência
- Verificar a abertura inicial em vertical, troca para horizontal e manutenção da escolha após recarregar.
- Conferir apresentação em telas amplas e pequenas, inclusive projetos com muitas etapas e nomes longos.
- Verificar, em um projeto acessível, abertura do modal de tarefas e preservação das ações atuais. Se o acesso autenticado não estiver disponível, informar essa limitação.