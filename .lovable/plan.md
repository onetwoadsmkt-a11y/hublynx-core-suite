# Agenda e Tarefas integradas, com prioridade e avisos

## O que existe hoje
- **Agenda**: busca tarefas gerais, reuniões, agendamentos de leads e Google Agenda. Abre por padrão na visão **Semana**. Só mostra itens em que o usuário é o dono, e não filtra pela empresa ativa. Clicar em um dia leva para a visão Dia.
- **Tarefas**: Lista (padrão), Kanban e Calendário mensal. Usa tarefas gerais da empresa ativa mais os agendamentos de leads (desde ontem). Clicar em um dia cria uma tarefa.
- **Agendamentos de lead**: não têm campo de prioridade, por isso sempre aparecem como "média". Tarefas gerais usam baixa / média / alta / crítica. "Crítica" vai aparecer com o nome **Urgente**, sem mudar o que já está salvo.
- **Menu**: o item Tarefas é um link simples, sem contador e sem submenu.
- **Semana**: continua como está. Só passa a atualizar junto quando algo mudar.

## O que muda
1. **Mesmas pendências nas duas telas**: Agenda e Tarefas passam a ler a mesma lista, com tarefas gerais e agendamentos de leads da empresa ativa. Reuniões e Google Agenda continuam só na Agenda, como itens extras. Criar, editar, concluir ou excluir em uma tela atualiza a outra na hora, sem duplicar nada.
2. **Mês como visão principal** nas duas telas. As outras visões continuam disponíveis.
3. **Atrasadas em vermelho**: itens com prazo vencido e não concluídos ganham fundo vermelho e um ícone de alerta. No mês, o número de atrasadas também aparece no dia.
4. **Clicar num dia abre o painel do dia**: uma janela lateral no computador e uma gaveta de baixo para cima no celular. Ela lista as pendências do dia com prioridade, lead/cliente e horário, e tem o botão "+ Adicionar". Será o mesmo painel nas duas telas.
5. **Prioridade nos agendamentos do lead**: campo Prioridade (Baixa, Média, Alta, Urgente) ao criar ou editar pelo cartão do lead e no modal do agendamento. As listas passam a mostrar a prioridade real.
6. **Aviso de prioritárias** após o login: uma caixa flutuante no canto inferior direito lista as tarefas Alta/Urgente pendentes sob sua responsabilidade, com o botão **CIENTE**. A confirmação fica salva no banco para cada usuário e cada tarefa. O aviso só volta se surgir uma nova prioritária.
7. **Menu**: o item Tarefas ganha uma bolinha vermelha com a quantidade de prioritárias pendentes e um subitem **Prioridade**, que abre Tarefas já filtrada por Alta/Urgente.
8. **Nome do lead como link** no calendário, no painel do dia, na lista e no aviso. Ao clicar, abre o mesmo cartão de lead do Pipeline por cima da tela atual. Ao fechar, você volta para onde estava.

## Mudança no banco (você roda no SQL Editor)
Arquivo `21_prioridade_e_avisos.sql`, que só acrescenta itens novos:
- `lead_tasks.priority`: usa o mesmo tipo das tarefas gerais, com padrão 'media'. Os registros atuais ficam como média.
- Tabela `task_priority_acks`, que guarda quem confirmou qual tarefa e quando. Ela é ligada ao usuário e à empresa, com segurança por linha: cada pessoa só lê e grava as próprias confirmações dentro das empresas de que participa.
- Nada existente é apagado ou alterado. As regras de acesso atuais continuam iguais.

Até você rodar o arquivo, o sistema continua funcionando: os agendamentos aparecem como média e o aviso fica guardado só no navegador.

## Detalhes técnicos
- Um novo `src/lib/tasks/pending.functions.ts` (`listPendingItems`, com `requireSupabaseAuth` e organizationId) junta `tasks` (escopo pela org) e `listLeadScheduledTasks` por meio do adaptador `leadTaskDisplay`. Agenda e Tarefas usam a chave compartilhada `["tasks","pending",org]`. `getAgendaEvents` passa a receber organizationId e deixa de buscar tarefas/lead_tasks, que vêm da fonte compartilhada.
- Um helper único de invalidação (`invalidatePendingQueries`) cuida de `tasks`, `agenda`, `week`, `lead-detail` e `priority-alerts`. Ele é usado em TaskDrawer, TaskQuickForm, LeadTaskDialog, LeadDrawer e nas ações da Agenda.
- Um `DayPendingSheet` compartilhado (Sheet do shadcn, `side="bottom"` no celular) mais `isOverdue()` em `src/lib/tasks/date-filter.ts`, com testes.
- `upsertLeadTask` aceita `priority` (enum `task_priority`). `leadTaskDisplay` usa `task.priority ?? "media"`. A leitura fica tolerante enquanto a coluna não existir.
- `listPriorityAlerts` e `ackPriorityAlerts` são server functions autenticadas, sem cliente privilegiado. A responsabilidade vale para tarefas com `assignee_id = eu` (ou `owner_id` quando não há responsável) e para lead_tasks com `owner_id = eu`, sempre na empresa ativa. O aviso é montado em `__root`/AppShell, só para quem está logado, e é removido ao clicar em CIENTE.
- Um `LeadDrawerHost` global controlado pelo parâmetro `?lead=<id>`, que reutiliza o LeadDrawer e os dados do pipeline (`getLeadDetail`).
- O AppShell ganha um badge com contador e um subitem para `/tarefas?prioridade=1`. O texto do menu continua preto.
- Testes novos: atraso, mapeamento de prioridade (critica → Urgente) e regra do aviso (mostrar só ids que ainda não foram confirmados).

## O que não dá para testar sem login
Os dados reais da conta, o aviso após o login, o contador do menu e a abertura do cartão do lead a partir da Agenda. Vou conferir a estrutura e o celular com Playwright e com os testes automáticos.
