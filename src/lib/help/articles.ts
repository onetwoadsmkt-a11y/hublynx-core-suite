/**
 * Conteúdo da Central de Ajuda (/ajuda). Texto puro, sem banco: para mudar um passo,
 * edite aqui. Os rótulos citam os botões como aparecem na tela — se mudar um botão,
 * atualize o artigo.
 *
 * `access`: quem vê o tema no menu da ajuda.
 *  - "all": todo mundo (inclui equipe de projeto)
 *  - "crm": quem usa o comercial (Pipeline, Leads, Agenda...)
 *  - "admin": administrador da empresa
 */
export type HelpAccess = "all" | "crm" | "admin";

export type HelpStep = { title: string; text: string };

export type HelpArticle = {
  id: string;
  title: string;
  summary: string;
  steps: HelpStep[];
  tips?: string[];
  /** Página do sistema para o botão "Abrir". */
  path?: string;
};

export type HelpCategory = {
  id: string;
  title: string;
  description: string;
  icon: "start" | "pipeline" | "leads" | "forms" | "agenda" | "clients" | "projects" | "reports" | "settings" | "mobile";
  access: HelpAccess;
  articles: HelpArticle[];
};

export const HELP_CATEGORIES: HelpCategory[] = [
  // ───────────────────────────── PRIMEIROS PASSOS
  {
    id: "primeiros-passos",
    title: "Primeiros passos",
    description: "Entrar, se localizar no menu e ajustar o básico.",
    icon: "start",
    access: "all",
    articles: [
      {
        id: "entrar",
        title: "Entrar no Core Suite e trocar a senha",
        summary: "Primeiro acesso, senha esquecida e troca de senha.",
        steps: [
          { title: "Abra o endereço do sistema", text: "No navegador do computador ou do celular, abra o endereço do Core Suite que você recebeu no convite (ex.: core.hublynx.com.br). Salve nos favoritos para achar depois." },
          { title: "Escolha como entrar", text: "Na aba “Entrar”, digite seu e-mail e senha e clique em “Entrar”. Se a sua conta usa Google, clique em “Entrar com Google” e escolha a conta da empresa." },
          { title: "Primeiro acesso com senha provisória", text: "Se você recebeu uma senha provisória por e-mail, entre com ela. O sistema abre a janela de troca de senha e só libera o uso depois que você criar a sua." },
          { title: "Esqueceu a senha", text: "Na tela de entrada, clique em “Esqueceu a senha?”, digite o e-mail cadastrado e clique para enviar. Abra o e-mail recebido (confira o spam) e clique no link para criar uma senha nova." },
          { title: "Troque a senha quando quiser", text: "Já dentro do sistema, clique na sua foto ou iniciais no canto superior direito e escolha “Alterar senha”. Digite a nova senha duas vezes e salve." },
          { title: "Saia ao terminar em computador compartilhado", text: "No mesmo menu da sua foto, clique em “Sair”. Em computador de uso pessoal você pode continuar conectado." },
        ],
        tips: [
          "Use pelo menos 8 caracteres, misturando letras e números. Não use a mesma senha de outros sites.",
          "Não compartilhe a senha: cada pessoa da equipe deve ter o próprio acesso, assim o histórico mostra quem fez cada coisa.",
        ],
      },
      {
        id: "menu",
        title: "Conhecer o menu e a barra do topo",
        summary: "Onde fica cada área do sistema e o que cada botão do topo faz.",
        steps: [
          { title: "Menu lateral", text: "No computador, o menu fica à esquerda, em grupos: Comercial (Dashboard, Pipeline, Leads, Formulários, Agenda, Relatórios), Operação (Clientes, Projetos), Administração (Portal do cliente, Configurações) e Suporte (Central de ajuda). Clique no item para abrir a tela." },
          { title: "Recolher o menu", text: "Use o botão de recolher no topo do menu para deixar só os ícones e ganhar espaço na tela (útil no Kanban). Clique de novo para abrir." },
          { title: "Trocar de empresa", text: "Se você participa de mais de uma empresa, clique no nome da empresa no topo do menu e escolha outra. Pipeline, leads, agenda e projetos passam a mostrar os dados da empresa escolhida." },
          { title: "Notificações", text: "O sino no topo mostra os avisos: tarefas novas para você, mensagens de projeto, prazos e atrasos. Clique num aviso para ir direto à tarefa ou ao projeto. O número vermelho mostra quantos avisos ainda não foram lidos." },
          { title: "Ocultar valores", text: "O cadeado “Valores” esconde ou mostra os valores em reais nas telas. Use antes de compartilhar a tela numa reunião." },
          { title: "Tema claro ou escuro", text: "O botão de tema alterna entre claro e escuro. As cores da sua empresa continuam aplicadas nos dois." },
          { title: "Seu perfil", text: "Clique na sua foto para ver o seu nome, trocar a senha ou sair." },
        ],
        tips: ["Se algum item do menu não aparece para você, a empresa não tem aquele módulo ou o seu acesso não inclui aquela área. Fale com o administrador da empresa."],
      },
      {
        id: "dashboard",
        title: "Ler o Dashboard",
        summary: "A visão geral da operação e o painel comercial do funil.",
        path: "/dashboard",
        steps: [
          { title: "Abra o Dashboard", text: "Clique em “Dashboard” no menu. É a primeira tela depois de entrar." },
          { title: "Blocos da operação", text: "Em “Tarefas do dia” você vê o que vence hoje; em “Próximos eventos”, as reuniões e compromissos; em “Projetos em andamento”, o progresso de cada projeto." },
          { title: "Escolha o pipeline", text: "No painel comercial, escolha o pipeline no seletor. Ao lado do nome aparece quantos leads ele tem. Sem escolha, abre o pipeline principal." },
          { title: "Escolha o período", text: "Escolha o período dos números (ex.: 7 dias, 30 dias). “Tudo” mostra a situação atual do funil, sem comparação com período anterior. Pipeline e período ficam salvos no seu navegador." },
          { title: "Visão Padrão ou Funil", text: "Troque entre as visões “Padrão” e “Funil”. No Funil, clique em “Objetivos do funil” e defina o que conta como conversão e o papel de cada etapa (avanço ou saída) para ver a conversão etapa a etapa e as metas." },
          { title: "Atualização", text: "O painel se atualiza sozinho a cada minuto e ao voltar para a aba. “Atualizado às HH:MM” mostra a última leitura; clique nele para atualizar na hora." },
          { title: "Vá para o detalhe", text: "Use “Ver agenda”, “Ver todas” e “Ver todos” para abrir a lista completa de cada bloco." },
        ],
      },
    ],
  },

  // ───────────────────────────── PIPELINE
  {
    id: "pipeline",
    title: "Pipeline (funil de vendas)",
    description: "Acompanhar leads por etapa, mover cards e automatizar o funil.",
    icon: "pipeline",
    access: "crm",
    articles: [
      {
        id: "pipeline-usar",
        title: "Usar o Kanban do pipeline",
        summary: "Visualizar, filtrar e mover leads entre etapas.",
        path: "/pipeline",
        steps: [
          { title: "Abra o Pipeline", text: "Clique em “Pipeline” no menu. Cada coluna é uma etapa do funil e cada card é um lead. No topo da coluna aparecem a quantidade de leads e o valor somado." },
          { title: "Escolha o funil", text: "Se a empresa tiver mais de um pipeline (ex.: NOVO FUNIL e SCORING NUTRIÇÃO), escolha qual ver no seletor de pipeline no topo da tela." },
          { title: "Kanban ou Lista", text: "Em “Visualização”, escolha Kanban (colunas) ou Lista (tabela com colunas ordenáveis). O sistema lembra a escolha neste navegador." },
          { title: "Role o quadro", text: "Com muitas etapas, use a barra de rolagem na parte de baixo da tela ou arraste para o lado no celular." },
          { title: "Mova o lead de etapa", text: "No Kanban, clique e segure o card, arraste até a outra coluna e solte. Na Lista, troque a etapa direto no seletor da linha. A mudança fica registrada na jornada do lead e pode disparar as automações da etapa." },
          { title: "Etapas de ganho e perda", text: "Ao soltar o lead na etapa de venda ganha, abre a janela para converter em cliente e criar o projeto (veja “Ganhar um lead”). Etapas finais são fixas e não podem ser editadas." },
          { title: "Busque um lead", text: "Digite no campo “Buscar lead, campanha...” o nome, empresa, telefone ou campanha. O quadro mostra só os cards que batem." },
          { title: "Use os filtros", text: "Clique em “Filtros”. À esquerda há atalhos (Todos os leads, Entraram hoje, Leads quentes, Leads sem tarefas, Com tarefas agendadas, Com tarefas atrasadas). Ao lado, filtre por Data de entrada, Etapas, Temperatura, Origem do lead, Tags e Tarefas. Clique em “Ver leads” para aplicar e em “Limpar filtros” para voltar a ver tudo." },
          { title: "Ações em vários leads", text: "Clique em “Selecionar”, toque nos cards que quer marcar (ou em “Selecionar todos”) e use a barra de baixo: “Mover para…” muda todos de etapa; “Excluir” apaga (só administrador da empresa, com confirmação; leads ligados a projeto não são apagados)." },
        ],
        tips: ["Os filtros ficam salvos por pipeline neste navegador. Se um lead “sumiu”, confira se não há filtro ativo."],
      },
      {
        id: "lead-novo",
        title: "Cadastrar um lead manualmente",
        summary: "Criar um card novo no funil.",
        path: "/pipeline",
        steps: [
          { title: "Confira se o contato já existe", text: "Antes de cadastrar, pesquise o telefone ou e-mail em “Leads” para não criar a mesma pessoa duas vezes." },
          { title: "Clique em “Novo lead”", text: "No topo do Pipeline (ou da tela Leads), clique em “Novo lead”." },
          { title: "Preencha o contato", text: "Digite o “Nome *” (obrigatório), Empresa, Telefone, E-mail, Cidade e Estado." },
          { title: "Preencha o comercial", text: "Informe o “Valor (R$)” estimado, a Origem (ex.: Site, Meta Ads, Indicação), a Temperatura (Quente, Morno ou Frio) e a Etapa onde o lead entra." },
          { title: "Próxima ação", text: "Se já sabe o próximo passo, preencha “Próxima ação” (ex.: Ligar, enviar proposta) e a “Data da próxima ação”." },
          { title: "Salve", text: "Clique em salvar. O card aparece na etapa escolhida e as automações dessa etapa rodam." },
        ],
      },
      {
        id: "card-lead",
        title: "Trabalhar no card do lead",
        summary: "Ficha completa: dados, respostas, anotações, tarefas, tags e arquivos.",
        path: "/pipeline",
        steps: [
          { title: "Abra o card", text: "Clique no card do lead (no Kanban, na Lista, em Leads ou num aviso). A ficha abre na lateral. O endereço da página guarda o lead aberto: se recarregar, ele abre de novo." },
          { title: "Topo do card", text: "No topo ficam o nome, o valor, a etapa e o pipeline. Troque de etapa ou de pipeline pelos seletores “Pipeline” e “Etapa”. Os ícones abrem o WhatsApp do lead, enviam e-mail, adicionam tag e abrem o lead em outra aba." },
          { title: "Dados de cadastro", text: "Confira Nome / empresa, Telefone / WhatsApp, E-mail, Cidade / Estado e Origem. Se faltar algo importante, aparece “Cadastro incompleto”. Clique no lápis “Editar lead” para corrigir." },
          { title: "Qualificação e respostas", text: "Leads de formulário mostram a “Qualificação do formulário” (pontuação e classificação: Quente, Morno, Frio ou Nutrição) e todas as “Respostas do formulário”. Em “Campanha / anúncio” e “UTM” aparecem a campanha e o anúncio de origem." },
          { title: "Escreva anotações", text: "Em “Anotações”, registre conversas, detalhes ou próximos passos e clique em “Adicionar”. O texto não se perde se a página fechar antes de salvar: ele volta como rascunho." },
          { title: "Agende tarefas", text: "Na aba “Tarefas”, clique em “Nova tarefa para este lead”, escolha o tipo (Tarefa, Reunião, Ligação, Follow-up), título, data e horário, duração e prioridade (Baixa, Média, Alta, Urgente) e salve. Se o Google estiver conectado, o compromisso vai para o Google Agenda." },
          { title: "Conclua e agende a próxima", text: "Em cada agendamento, use “Tarefa concluída” para registrar o resultado e já “Agendar próxima ação”. Para mudar só a data, clique na data (ou no ícone de calendário), escolha a nova data e hora e clique em “Remarcar”." },
          { title: "Anexe arquivos", text: "Na aba “Arquivos”, envie propostas, contratos e documentos. Sem internet, o arquivo fica guardado no aparelho e é enviado quando a conexão voltar (“Tentar agora” envia na hora)." },
          { title: "Consulte o histórico", text: "Em “Histórico da jornada” fica tudo o que aconteceu: entrada, mudanças de etapa, anotações, tarefas, automações e mensagens." },
          { title: "Feche o card", text: "Clique no “x” no canto superior direito ou aperte Esc." },
        ],
        tips: ["No menu “…” do card, no Kanban, há “Editar”, “Excluir” e “Exportar jornada (Excel)” com todo o histórico do lead."],
      },
      {
        id: "duplicados",
        title: "Lead duplicado: conferir e unir",
        summary: "O que fazer quando a mesma pessoa entra mais de uma vez.",
        path: "/pipeline",
        steps: [
          { title: "Identifique o aviso", text: "Quando a mesma pessoa se inscreve de novo (formulário ou integração) com o mesmo telefone ou e-mail, o card novo mostra “Duplicado?” / “Possível contato duplicado”." },
          { title: "Abra a comparação", text: "Clique no aviso. A janela mostra lado a lado o card anterior e a nova inscrição, com datas, etapa e respostas." },
          { title: "Decida", text: "Se for a mesma pessoa, clique em “Unir neste card”: as informações, tarefas, anotações e o histórico ficam num só lead. Se for outra pessoa (ex.: telefone da empresa), apenas feche a janela." },
          { title: "Confira o resultado", text: "Abra o card que ficou e veja na jornada o registro da união." },
        ],
        tips: ["O mesmo envio que chega por dois caminhos (ex.: formulário e Make) em até 30 minutos é unido automaticamente, sem criar outro card."],
      },
      {
        id: "ganho",
        title: "Ganhar um lead e virar cliente/projeto",
        summary: "Converter o lead quando a venda fecha.",
        path: "/pipeline",
        steps: [
          { title: "Mova para a venda ganha", text: "Arraste o lead para a etapa final de venda ganha. Abre a janela “Converter lead em cliente”." },
          { title: "Confira o cliente", text: "Em “Cliente”, confira Nome *, Empresa, E-mail e Telefone (vêm do lead; corrija se precisar)." },
          { title: "Dados do projeto", text: "Em “Projeto”, informe o “Nome do projeto *”, o Serviço (ex.: Consultoria, Tráfego pago, Desenvolvimento), o Modelo comercial (Projeto fechado, Mensal recorrente, Por hora, Banco de horas) e o Início." },
          { title: "Modelo de roadmap", text: "Em “Modelo de roadmap”, escolha um modelo para o projeto já nascer com etapas, tarefas, prazos e equipe. Sem modelo, o projeto começa vazio." },
          { title: "Portal do cliente", text: "Marque “Convidar o cliente para o portal” para ele receber o acesso e acompanhar o projeto. Use “Copiar acesso” para mandar por WhatsApp." },
          { title: "Confirme", text: "Confirme a conversão. O lead passa a aparecer em Clientes e o projeto em Projetos, ligados ao histórico do lead." },
        ],
        tips: ["Marcou como venda ganha por engano? Veja o guia “Desfazer uma venda ganha”."],
      },
      {
        id: "desfazer-ganho",
        title: "Desfazer uma venda ganha",
        summary: "Lead marcado como ganho por engano volta para o funil.",
        path: "/pipeline",
        steps: [
          { title: "Abra o card do lead", text: "No Pipeline (coluna de venda ganha) ou em Clientes, clique no lead. No topo do card aparece a faixa “🏆 Venda ganha”." },
          { title: "Clique em “Desfazer venda ganha”", text: "Abre a janela para reabrir o lead." },
          { title: "Escolha para onde ele volta", text: "Escolha o Pipeline e a etapa. A etapa em que ele estava antes da venda vem marcada como “(antes da venda)”." },
          { title: "Projeto e cliente da conversão", text: "Se a venda criou um projeto e um cliente, marque “Excluir o projeto” e “Remover o cliente” para apagá-los (só administrador da empresa; as tarefas abertas do projeto são encerradas). Sem marcar, eles continuam em Projetos e Clientes." },
          { title: "Motivo e confirmação", text: "Escreva o motivo (opcional) e clique em “Desfazer venda ganha”. O lead volta para a etapa escolhida, sai de Clientes, perde a tag de ganho e a jornada registra “Venda ganha desfeita”." },
        ],
        tips: ["As automações da etapa de volta não rodam de novo, para não reenviar e-mails nem criar tarefas repetidas."],
      },
      {
        id: "configurar-funil",
        title: "Configurar o funil: etapas, tags, layout e pipelines",
        summary: "Ajustar o funil ao processo da empresa.",
        path: "/pipeline",
        steps: [
          { title: "Abra as configurações do funil", text: "No Pipeline, clique no botão de engrenagem ao lado de “Novo lead”. O menu tem Pipeline, Configurar funil e Automação." },
          { title: "Criar ou renomear pipeline", text: "Em “Pipeline”, crie um novo funil, renomeie ou exclua o pipeline que está aberto." },
          { title: "Etapas", text: "Em “Configurar funil › Etapas”, abre “Etapas do funil”: clique na cor para trocar, clique no nome para renomear (salva ao sair do campo) e use a lixeira para excluir. Para criar, digite em “Nova etapa” e clique em “+”. As etapas de venda ganha e desqualificado são fixas." },
          { title: "Layout do card", text: "Em “Layout do card”, ligue ou desligue o que aparece no card do Kanban: Empresa, Cidade / Estado, Telefone, E-mail, Pontuação e classificação, Valor, Origem / fonte, UTMs e Tempo desde a criação. Vale para este navegador." },
          { title: "Tags de conversão", text: "Em “Tags de conversão”, clique em “Nova tag”, digite o nome e salve. Essas tags aparecem no card, nos filtros, no relatório e nas automações." },
        ],
      },
      {
        id: "automacoes",
        title: "Criar automações do Kanban",
        summary: "Mover leads, criar tarefas e enviar e-mails sozinho.",
        path: "/pipeline",
        steps: [
          { title: "Abra as automações", text: "No Pipeline, clique na engrenagem › “Automação” › “Automações do Kanban”. Escolha a etapa em que a automação vai ficar." },
          { title: "Nova automação", text: "Clique em “Adicionar automação” e dê um nome claro (ex.: Follow-up automático após proposta)." },
          { title: "Quando (gatilho)", text: "Escolha quando ela roda: “Imediatamente ao entrar nesta etapa”, “Depois de um tempo na etapa” (informe minutos, horas ou dias), “Ao entrar na etapa com uma tag” ou “Ao receber uma tag enquanto está nesta etapa”." },
          { title: "Se (condições)", text: "Em “+ Adicionar condição”, escolha: Classificação do lead é (Quente, Morno, Frio, Nutrição), Tem a tag / Não tem a tag, Valor maior ou igual a / menor ou igual a, Tem e-mail, Tem telefone, Não tem tarefa em aberto ou Tem tarefa atrasada. Todas precisam valer. Sem condições, vale para todos os leads da etapa." },
          { title: "Então (ações em ordem)", text: "Em “+ Adicionar ação”, escolha: Mover para etapa, Enviar para outro pipeline, Adicionar tag, Remover tag, Mudar classificação do lead, Enviar e-mail (modelo), Criar tarefa / agendamento (tipo, título, em quantos dias, horário e prioridade) ou Adicionar anotação. As ações rodam na ordem da lista." },
          { title: "Salve e ative", text: "Clique em “Salvar automação” e confira se a chave “Ativa” está ligada. O resumo do card mostra “Quando / Se / Então”." },
          { title: "Aplique nos leads que já estão na etapa", text: "A automação roda quando o lead entra. Para os que já estavam lá, clique em “Aplicar aos leads da etapa” e confirme. Cada lead é processado uma vez por passagem na etapa." },
          { title: "Confira as execuções", text: "Na aba “Execuções”, veja em quais leads a automação rodou, quando e o resultado." },
        ],
        tips: [
          "A classificação vem do formulário de lead scoring. Se o lead chega primeiro sem classificação e ela chega depois, a automação confere de novo sozinha.",
          "Uma automação que move o lead pode disparar a automação da etapa seguinte (até 3 em sequência).",
        ],
      },
      {
        id: "modelos-email",
        title: "Criar modelos de e-mail para as automações",
        summary: "Textos prontos com o nome do lead, enviados pelo seu Gmail.",
        path: "/pipeline",
        steps: [
          { title: "Abra os modelos", text: "No Pipeline, engrenagem › “Automação” › “Modelos de e-mail” e clique em “Novo modelo”." },
          { title: "Nome e assunto", text: "Dê um “Nome do modelo” (ex.: Boas-vindas) e escreva o Assunto (ex.: {primeiro_nome}, recebemos seu contato)." },
          { title: "Texto", text: "Escreva a mensagem em Texto ou HTML, ou use “Importar .html”. Use as variáveis {nome}, {primeiro_nome}, {empresa}, {email}, {telefone}, {cidade}, {estado}, {valor}, {etapa}, {pipeline} e {responsavel}." },
          { title: "Pré-visualize e teste", text: "Confira a pré-visualização com dados de exemplo e use “Enviar teste” para mandar para o seu e-mail." },
          { title: "Salve e use", text: "Clique em “Salvar modelo”. Na automação, escolha a ação “Enviar e-mail (modelo)” e selecione o modelo." },
        ],
        tips: ["O e-mail sai pelo Gmail conectado em Configurações › Integrações. Sem conexão, a ação falha e aparece em Execuções."],
      },
      {
        id: "webhooks",
        title: "Receber leads de fora (Make, Meta, site)",
        summary: "Integrar formulários e anúncios ao funil por webhook.",
        path: "/pipeline",
        steps: [
          { title: "Abra os Webhooks", text: "No Pipeline, engrenagem › “Configurar funil” › “Webhooks”. Abre “Webhooks · integração com Make”." },
          { title: "Crie a URL de recebimento", text: "Na aba “Receber leads”, preencha o Nome (ex.: Cenário Make - Leads), a “Etapa de destino” e a “Fonte do lead (origem)” (ex.: Meta Ads, Site) e clique em “Gerar URL de recebimento”. Copie a URL." },
          { title: "Configure o Make", text: "No cenário do Make, adicione o módulo “HTTP → Make a request”, método POST, corpo Raw no formato JSON, e cole a URL do Core." },
          { title: "Mapeie os campos", text: "No JSON, envie nome, telefone, e-mail, cidade, estado e os demais campos do anúncio ou formulário. Campos extras vão para a ficha do lead." },
          { title: "Teste", text: "Rode o cenário uma vez e confira o card novo na etapa de destino." },
          { title: "Enviar eventos ao Make (opcional)", text: "Na aba “Enviar eventos”, cole a URL de um “Webhooks → Custom webhook” do Make e clique em “Salvar webhook do Make”. O Core avisa o Make quando algo acontece com o lead." },
        ],
        tips: ["A URL de recebimento funciona como uma senha: não publique em lugares abertos. Se vazar, exclua e gere outra."],
      },
    ],
  },

  // ───────────────────────────── LEADS
  {
    id: "leads",
    title: "Leads",
    description: "A lista de todos os contatos, em formato de tabela.",
    icon: "leads",
    access: "crm",
    articles: [
      {
        id: "leads-lista",
        title: "Pesquisar, organizar e exportar leads",
        summary: "Encontrar qualquer contato rápido e baixar a lista.",
        path: "/leads",
        steps: [
          { title: "Abra Leads", text: "Clique em “Leads” no menu. A tabela mostra Lead, Contato, Origem, Etapa e Valor. Leads ganhos ficam em Clientes." },
          { title: "Pesquise", text: "Digite em “Buscar nome, empresa, e-mail, telefone…”. A lista filtra enquanto você digita." },
          { title: "Filtre", text: "Escolha o pipeline (“Todos os pipelines”) e a etapa (“Todas as etapas”)." },
          { title: "Ordene", text: "Ordene por “Mais recentes”, “Nome (A–Z)” ou “Maior valor”." },
          { title: "Abra o lead", text: "Clique na linha para abrir o card completo do lead, igual ao do Pipeline." },
          { title: "Exporte", text: "Clique em “Exportar Excel” para baixar a lista com os filtros aplicados." },
        ],
      },
    ],
  },

  // ───────────────────────────── FORMULÁRIOS
  {
    id: "formularios",
    title: "Formulários",
    description: "Captar e qualificar leads com formulários e lead scoring.",
    icon: "forms",
    access: "crm",
    articles: [
      {
        id: "form-criar",
        title: "Criar um formulário",
        summary: "Escolher o tipo e montar campos e perguntas.",
        path: "/formularios",
        steps: [
          { title: "Novo formulário", text: "Em “Formulários”, clique em “Novo formulário”. Digite o “Nome do formulário” (nome interno, ex.: Campanha de franquias)." },
          { title: "Escolha o modelo", text: "“Captação de dados”: só cadastro (nome, contato, cidade). “Qualificação com lead scoring”: perguntas que dão pontos e classificam o lead em Quente, Morno, Frio ou Nutrição. Clique em “Criar formulário”." },
          { title: "Estrutura", text: "Na aba “Estrutura”, escreva o “Título do formulário” e o Subtítulo que o lead vê e confira a ordem: os dados pessoais e as perguntas seguem a ordem da lista." },
          { title: "Campos e perguntas", text: "Na aba “Campos”, adicione os dados pessoais (nome, e-mail, telefone, cidade, estado) e as perguntas. Em cada uma, escreva o texto, as opções (para seleção) e marque “Obrigatório” quando necessário." },
          { title: "Destino no CRM", text: "Na aba “Destino no CRM”, escolha o Pipeline, a “Etapa de entrada” e a “Origem do lead” (aparece no card e nos relatórios; em branco usa o nome do formulário). Cada envio vira um card com todas as respostas e as UTMs da campanha." },
          { title: "Salve", text: "Clique em “Salvar” para guardar o rascunho. O link público só muda quando você publicar." },
        ],
      },
      {
        id: "form-scoring",
        title: "Configurar a pontuação e a lógica (lead scoring)",
        summary: "Pontos por resposta, faixas de classificação e regras.",
        path: "/formularios",
        steps: [
          { title: "Pontos por resposta", text: "Na aba “Pontuação”, em “Pontuação das perguntas”, dê pontos a cada opção das perguntas de seleção. Perguntas marcadas como “Inativa — não pontua” não contam." },
          { title: "Faixas de classificação", text: "Em “Faixas de classificação”, defina de quantos a quantos pontos o lead é Quente, Morno, Frio ou Nutrição. Use “Nova faixa” se precisar." },
          { title: "Sem sobreposição nem lacuna", text: "As faixas não podem se sobrepor nem deixar lacunas (ex.: 0–20, 21–40, 41–100). Enquanto houver erro, a publicação fica bloqueada e o editor mostra o aviso." },
          { title: "Regras condicionais", text: "Na aba “Lógica”, clique em “Nova regra”. Em “Condição”, escolha a resposta, a pontuação total ou a classificação; em “Então”, escolha a ação: pular para outra pergunta, definir a classificação ou encerrar numa tela final." },
          { title: "Ordem das regras", text: "As regras rodam na ordem de prioridade. Marque “Parar após esta regra” quando ela deve encerrar a avaliação." },
          { title: "Teste", text: "Use a “Prévia mobile em tempo real” ou “Visualizar” e responda como um lead para conferir o caminho e a classificação." },
        ],
      },
      {
        id: "form-publicar",
        title: "Aparência, encerramento e publicação",
        summary: "Deixar com a cara da empresa e colocar no ar.",
        path: "/formularios",
        steps: [
          { title: "Aparência", text: "Na aba “Aparência”, escolha o formato (Foco, Dividido ou Imersivo), as cores, as imagens e o tamanho dos textos. Cores e formato valem só para este formulário." },
          { title: "Encerramento", text: "Na aba “Encerramento”, escreva a mensagem das “Telas finais”, o texto do botão e o “Link de redirecionamento” (o botão só aparece com link preenchido)." },
          { title: "Configurações", text: "Na aba “Configurações”, ajuste o endereço público, o texto de consentimento e o “ID do Meta Pixel (Facebook)” para registrar PageView ao abrir e Lead ao enviar." },
          { title: "Publique", text: "Clique em “Publicar”. Só então o link público passa a mostrar as mudanças. Enquanto houver alterações não publicadas, o editor avisa." },
          { title: "Divulgue o link", text: "Na lista de Formulários, use “Copiar link” e cole no anúncio, site, bio ou WhatsApp. “Ver” abre o formulário como o lead vê." },
          { title: "Acompanhe", text: "A lista mostra os leads de cada formulário (total e últimos 30 dias). Use “Duplicar” para criar uma variação sem começar do zero." },
        ],
      },
    ],
  },

  // ───────────────────────────── AGENDA
  {
    id: "agenda",
    title: "Agenda e tarefas",
    description: "Tarefas, reuniões, follow-ups e prioridades do dia.",
    icon: "agenda",
    access: "crm",
    articles: [
      {
        id: "agenda-usar",
        title: "Organizar o dia na Agenda",
        summary: "Lista, Kanban e Calendário das tarefas.",
        path: "/tarefas",
        steps: [
          { title: "Abra a Agenda", text: "Clique em “Agenda” no menu. No topo, escolha a visualização: Lista, Kanban ou Calendário." },
          { title: "Kanban por prazo", text: "No Kanban, as tarefas ficam em Vencidas, Hoje, Esta semana, Depois, Sem data e Concluídas. Arrastar uma tarefa para outra coluna muda o prazo." },
          { title: "Calendário", text: "No Calendário, veja Mês, Semana ou Dia. Cada dia mostra as tarefas, os agendamentos de leads e os eventos do Google. Clique num dia para abrir o “Resumo do dia”." },
          { title: "Busque e filtre", text: "Use “Buscar tarefa...” e os filtros por cliente, tipo e responsável. “Filtros ativos” mostra o que está aplicado; “Limpar” remove tudo." },
          { title: "Abra uma tarefa", text: "Clique na tarefa. Tarefas de projeto abrem no projeto, na etapa certa; agendamentos de lead abrem com o botão para o card do lead; tarefas soltas abrem os “Detalhes da tarefa”." },
          { title: "Conclua ou remarque", text: "Nos detalhes, clique em “Concluir” ou altere a data e a hora do prazo. Para reuniões, “Criar link Meet” gera a videochamada e “Entrar no Meet” abre a reunião." },
        ],
        tips: ["Tarefas atrasadas aparecem em vermelho, com “Atrasada há N dias”. Com horário marcado, a tarefa atrasa assim que o horário passa."],
      },
      {
        id: "tarefa-criar",
        title: "Criar uma tarefa ou reunião",
        summary: "Tarefa, Reunião, Ligação ou Follow-up, com responsável e prazo.",
        path: "/tarefas",
        steps: [
          { title: "Clique em “Nova tarefa”", text: "Na Agenda, clique em “Nova tarefa” (ou no “+” de uma coluna do Kanban para já usar aquele prazo)." },
          { title: "Tipo e título", text: "Escolha o “Tipo de tarefa” (Tarefa, Reunião, Ligação, Follow-up) e escreva o “Título da tarefa *”. Em Descrição, coloque detalhes, pauta ou próximos passos." },
          { title: "Ligue a um lead (opcional)", text: "Em “Vincular lead”, busque por nome, empresa ou telefone. A tarefa vira um agendamento do lead e aparece no card dele." },
          { title: "Data, hora e duração", text: "Informe a “Data *” (padrão hoje), a hora (opcional) e a duração. Sem hora, a tarefa vale para o dia todo." },
          { title: "Prioridade e responsável", text: "Escolha a prioridade. Em “Responsável”, escolha a pessoa — ela recebe o aviso no sino e por e-mail. Deixe “Eu mesmo” para ficar com você." },
          { title: "Projeto e checklist (opcional)", text: "Em tarefas de projeto, escolha a “Etapa do projeto” (a tarefa entra no fim da etapa). Em “Checklist”, adicione os itens a cumprir." },
          { title: "Salve", text: "Clique em salvar. A tarefa aparece na Agenda, no Dashboard e, com o Google conectado, no Google Agenda." },
        ],
      },
      {
        id: "prioridades",
        title: "Tarefas prioritárias e alertas",
        summary: "Como funcionam os avisos de prioridade.",
        path: "/tarefas",
        steps: [
          { title: "Marque a prioridade", text: "Ao criar ou editar a tarefa, escolha a prioridade Alta ou Urgente." },
          { title: "Receba o aviso no dia", text: "Quando chega o dia da tarefa (ou se ela já está atrasada), o sistema mostra o aviso de prioridade ao abrir. Antes do dia, não aparece." },
          { title: "Confirme que viu", text: "Clique em “CIENTE” para confirmar. O aviso deixa de aparecer para você naquele dia; se a tarefa for remarcada, volta a avisar no novo dia." },
          { title: "Veja a lista", text: "Clique em “Ver prioridades” (ou no contador de prioridades do menu) para abrir a Agenda filtrada só nas prioritárias." },
        ],
      },
      {
        id: "minhas-tarefas",
        title: "Minhas tarefas",
        summary: "Tudo o que foi designado a você, em um lugar só.",
        path: "/minhas-tarefas",
        steps: [
          { title: "Abra “Minhas tarefas”", text: "No menu (no celular, em “Mais”). O topo mostra quantas estão Atrasadas, Para hoje e Em aberto." },
          { title: "Veja por grupo", text: "As tarefas aparecem em Atrasadas, Para hoje, Próximas e Sem prazo, com o projeto de cada uma." },
          { title: "Abra a tarefa", text: "Toque na tarefa: ela abre no projeto, na etapa certa e destacada, para você concluir ou mandar mensagem." },
        ],
      },
      {
        id: "google",
        title: "Sincronizar com o Google Agenda",
        summary: "Levar reuniões e tarefas para o seu Google.",
        path: "/configuracoes/integracoes",
        steps: [
          { title: "Conecte sua conta", text: "Em “Configurações › Integrações”, clique em “Conectar minha conta Google”, escolha a conta e autorize Gmail, Google Agenda e Google Drive." },
          { title: "Sincronização automática", text: "Depois de conectado, cada tarefa ou agendamento criado, editado ou concluído vai na hora para o Google Agenda de quem criou. Tarefas só com dia viram eventos de dia inteiro." },
          { title: "Sincronize manualmente", text: "No Calendário da Agenda, use “Sincronizar Google” para conferir tudo de uma vez." },
          { title: "Crie lead a partir de um evento", text: "Num evento do Google no calendário, use “Criar lead no Core”, escolha a etapa e o evento vira o agendamento do novo lead." },
        ],
      },
    ],
  },

  // ───────────────────────────── CLIENTES
  {
    id: "clientes",
    title: "Clientes e Portal do cliente",
    description: "Cadastro de clientes e acesso deles aos projetos.",
    icon: "clients",
    access: "crm",
    articles: [
      {
        id: "clientes-lista",
        title: "Gerenciar clientes",
        summary: "Status, contatos e projetos de cada cliente.",
        path: "/clientes",
        steps: [
          { title: "Abra Clientes", text: "Clique em “Clientes” no menu. Os leads ganhos no pipeline aparecem aqui automaticamente, com o card e a jornada do lead." },
          { title: "Cadastre um cliente", text: "Clique em “Novo cliente” para cadastrar quem não veio do pipeline: nome, empresa, contato e status." },
          { title: "Pesquise e filtre", text: "Busque em “Buscar nome, empresa, e-mail…” e filtre por status: Prospecto, Ativo, Inativo ou Inadimplente. Ordene por “Mais recentes” ou “Nome (A–Z)”." },
          { title: "Veja os projetos", text: "A coluna “Projetos” mostra os projetos do cliente; clique para abrir." },
          { title: "Atualize o status", text: "Em “Ações”, edite o cliente e mude o status quando a situação mudar (ex.: Inadimplente)." },
        ],
      },
      {
        id: "portal",
        title: "Liberar o Portal do cliente",
        summary: "O cliente acompanha o projeto pelo link do portal.",
        path: "/portal-clientes",
        steps: [
          { title: "Abra o Portal do cliente", text: "Em “Administração › Portal do cliente” (só administradores). A tela lista os projetos com o link do portal e quantos clientes têm acesso." },
          { title: "Dê acesso ao cliente", text: "Clique em “Acessos” no projeto: abre a aba Equipe do projeto. Adicione o cliente com o e-mail dele. Projetos sem cliente aparecem como “Só com cliente liberado”." },
          { title: "Envie o link", text: "Clique em “Copiar link” e envie ao cliente por e-mail ou WhatsApp. “Abrir portal” mostra como ele vê." },
          { title: "O que o cliente vê", text: "No portal, o cliente vê as etapas, as tarefas dele, as mensagens marcadas para o cliente e as planilhas liberadas, e recebe avisos no sino e por e-mail." },
        ],
      },
    ],
  },

  // ───────────────────────────── PROJETOS
  {
    id: "projetos",
    title: "Projetos",
    description: "Roadmap, tarefas, equipe e entregas de cada projeto.",
    icon: "projects",
    access: "all",
    articles: [
      {
        id: "projeto-criar",
        title: "Criar um projeto",
        summary: "Manualmente ou a partir de um modelo.",
        path: "/projetos",
        steps: [
          { title: "Novo projeto", text: "Em “Projetos”, clique em “Novo projeto”. Projetos também nascem ao ganhar um lead no pipeline." },
          { title: "Dados básicos", text: "Informe o nome do projeto, o cliente, a data de início, o prazo e o valor." },
          { title: "Escolha um modelo", text: "Escolha um modelo de projeto para já trazer etapas, tarefas padrão, prazos e a equipe. As datas são recalculadas a partir do início." },
          { title: "Crie", text: "Clique em “Criar projeto”. Cada pessoa da equipe do modelo recebe um e-mail com as tarefas dela." },
          { title: "Encontre na lista", text: "Use “Buscar projeto ou cliente” e os filtros de cliente, status, início e prazo. Cards com contorno vermelho têm tarefas atrasadas." },
        ],
      },
      {
        id: "projeto-usar",
        title: "Acompanhar o projeto",
        summary: "Etapas, tarefas, equipe, mensagens e arquivos.",
        path: "/projetos",
        steps: [
          { title: "Abra o projeto", text: "Clique no projeto. A faixa do topo mostra o progresso, o prazo, os dias restantes, a equipe e os riscos." },
          { title: "Etapas", text: "Na aba “Etapas”, escolha a etapa à esquerda e veja as tarefas pendentes. Filtre por Todas, Minhas, Atrasadas ou por pessoa da Equipe." },
          { title: "Conclua e date tarefas", text: "Em cada tarefa, ajuste início e prazo e clique em “Concluir” ao terminar. Quem é executor só conclui as próprias tarefas." },
          { title: "Mande mensagens", text: "No campo de mensagem da tarefa, escolha o destino: Equipe (todos), uma pessoa específica ou Cliente (aparece no portal). Envie arquivos pela tarefa." },
          { title: "Nova tarefa", text: "Clique em “Nova tarefa” na faixa do topo, escolha a etapa, o responsável e o prazo." },
          { title: "Outras abas", text: "Evolução (planejado × realizado), Equipe e permissões, Histórico e mensagens, Arquivos, Comercial (planilhas de custos e compras), Próximas entregas, Kanban, Atividade, Riscos & Bloqueios e Notas & Decisões." },
        ],
        tips: ["Quem é só da equipe de projeto vê apenas Projetos, Minhas tarefas e esta Central de ajuda."],
      },
      {
        id: "projeto-equipe",
        title: "Adicionar pessoas ao projeto",
        summary: "Equipe, papéis e acesso do cliente.",
        path: "/projetos",
        steps: [
          { title: "Abra a aba Equipe", text: "No projeto, abra “Equipe e permissões”." },
          { title: "Adicione", text: "Clique em “Novo membro”. Escolha “Da equipe” (pessoa da empresa) ou “Pessoa nova” (nome e e-mail)." },
          { title: "Papel e departamento", text: "Defina o papel (ex.: executor ou só visualiza) e o departamento." },
          { title: "Envie o acesso", text: "A pessoa recebe o convite por e-mail. Se não chegar, use “Reenviar acesso” ou copie a mensagem para mandar por WhatsApp." },
        ],
      },
      {
        id: "modelos",
        title: "Montar modelos de projeto",
        summary: "Padronizar etapas, tarefas e equipe.",
        path: "/configuracoes/modelos",
        steps: [
          { title: "Abra os modelos", text: "Em “Configurações › Modelos de projeto”, crie um modelo (ex.: Implantação de franquia) ou abra um existente." },
          { title: "Etapas", text: "Na aba “Etapas e tarefas”, clique em “Adicionar etapa”: informe nome, fase, prazo e aviso da etapa." },
          { title: "Tarefas padrão", text: "Dentro de cada etapa, adicione as tarefas, ordene com ↑ ↓ e escolha “Quem executa” (pessoa, Equipe ou Cliente). Use “Responsável de todas as tarefas da etapa” para aplicar de uma vez." },
          { title: "Pessoas do projeto", text: "Na aba “Pessoas do projeto”, inclua quem entra em todo projeto desse tipo, com papel e departamento, ou use “Incluir toda a equipe”." },
          { title: "Cronograma", text: "Na aba “Cronograma”, confira a linha do tempo das etapas." },
          { title: "Salve", text: "Clique em “Salvar modelo”. Sem salvar, etapas, tarefas e pessoas não ficam guardadas." },
        ],
      },
    ],
  },

  // ───────────────────────────── RELATÓRIOS
  {
    id: "relatorios",
    title: "Relatórios",
    description: "Exportar o comercial em Excel com filtros.",
    icon: "reports",
    access: "crm",
    articles: [
      {
        id: "relatorio-comercial",
        title: "Gerar o relatório comercial (passo a passo)",
        summary: "Do filtro à planilha em Excel, em 9 passos.",
        path: "/relatorios",
        steps: [
          { title: "Abra Relatórios", text: "Clique em “Relatórios” no menu (no celular, em “Mais”). Abre o “Relatório comercial”: à esquerda o painel “Filtros”; à direita os totais, a “Prévia” e as “Colunas da planilha”. No celular, os filtros abrem pelo botão “Filtros” no topo." },
          { title: "Comece do zero", text: "Se o painel mostra filtros de uma consulta anterior, clique em “Limpar” (ao lado de “Filtros”). Sem nenhum filtro, o relatório traz todos os leads e clientes da empresa aberta." },
          { title: "Escolha a Situação", text: "Em “Situação”, escolha Todos, Leads (ainda não ganhos) ou Clientes (vendas ganhas). Veja o guia “Entender cada filtro do relatório” para o que entra em cada um." },
          { title: "Escolha o Pipeline e as Etapas", text: "Em “Pipeline”, escolha o funil (ou “Todos os pipelines”). Em “Etapas”, marque uma ou mais etapas; sem marcar nenhuma, valem todas as etapas do pipeline escolhido." },
          { title: "Refine por Temperatura, Tarefas e Tags", text: "Marque as temperaturas (Quente, Morno, Frio, Nutrição), a situação das tarefas (com atrasadas / sem tarefas em aberto) e as tags que interessam." },
          { title: "Defina o Período de entrada", text: "Abra “Período de entrada” (vem fechado) e preencha “De” e “Até” com a data em que o lead entrou no Core. Os dois dias entram no resultado, no horário de Brasília." },
          { title: "Confira os totais e a prévia", text: "No topo aparecem os filtros ativos como etiquetas (clique no “x” para tirar um) e os totais: Leads no filtro, Valor total, Quentes, Com tarefa atrasada e Sem tarefas. A “Prévia” lista até 200 leads (Lead, Etapa, Temperatura, Tags e Tarefas); clique numa linha para abrir o card do lead." },
          { title: "Escolha as colunas da planilha", text: "Em “Colunas da planilha”, marque as colunas de cada grupo: Contato (nome, empresa, e-mail, telefone, cidade, estado), Comercial (pipeline, etapa, status, temperatura, valor, tags, notas, tarefas em aberto, tarefas atrasadas, próxima tarefa), Trackeamento (origem, UTMs, GCLID, FBCLID, landing URL, referrer) e Datas (criado em, atualizado em, último contato). “Selecionar tudo” marca todas e “Limpar” desmarca." },
          { title: "Exporte em Excel", text: "Se quiser, marque “Incluir anotações (aba dedicada)” e “Incluir histórico de jornada (aba dedicada)”. Clique em “Exportar Excel”: o arquivo relatorio-comercial-AAAA-MM-DD.xlsx é baixado com TODOS os leads do filtro (não só os 200 da prévia)." },
        ],
        tips: [
          "O botão “Exportar Excel” fica apagado enquanto os dados carregam ou quando nenhum lead bate com os filtros.",
          "Os filtros valem só enquanto a tela está aberta: ao sair de Relatórios e voltar, o painel começa limpo.",
        ],
      },
      {
        id: "relatorio-filtros",
        title: "Entender cada filtro do relatório",
        summary: "O que cada filtro faz e como eles se combinam.",
        path: "/relatorios",
        steps: [
          { title: "Como os filtros se combinam", text: "Filtros de grupos diferentes se somam com “E”: o lead precisa atender a todos (ex.: Etapa “Proposta” E Temperatura “Quente”). Dentro de um mesmo grupo, as opções valem com “OU” (ex.: Quente OU Morno). A exceção são as Tags no modo “Todas”." },
          { title: "Situação", text: "Todos: leads e clientes. Leads: só os ainda não ganhos. Clientes: só as vendas ganhas — lead convertido em cliente, que está numa etapa de venda ganha ou que tem uma tag de funil “Ganho”. Por isso um lead com a tag “Ganho” aparece em Clientes mesmo fora da etapa de venda ganha." },
          { title: "Pipeline", text: "“Todos os pipelines” mostra os leads de todos os funis da empresa. Escolher um pipeline traz só os leads das etapas dele. Ao trocar de pipeline, as Etapas e Tags marcadas são limpas, porque cada funil tem as suas." },
          { title: "Etapas", text: "Marque uma ou mais etapas para trazer só os leads que estão nelas agora (é a etapa atual, não o histórico). Sem pipeline escolhido, as etapas aparecem agrupadas pelo nome do pipeline. Etapas de venda ganha têm a etiqueta “ganho”. Nenhuma marcada = todas." },
          { title: "Temperatura", text: "Quente, Morno, Frio e Nutrição. Vale a mesma temperatura que o card mostra: primeiro a classificação do formulário de lead scoring; se o lead não tem classificação, a temperatura escolhida à mão no cadastro. Leads sem nenhuma das duas não entram quando uma temperatura está marcada." },
          { title: "Tarefas", text: "“Leads com tarefas atrasadas”: têm pelo menos um agendamento em aberto com data/hora já passada. “Leads sem tarefas em aberto”: não têm nenhum agendamento pendente (ótimo para achar leads esquecidos). Marcando os dois, entram os leads de um grupo OU do outro." },
          { title: "Tags", text: "Use “Buscar tag…” para achar a tag e marque as que quer. Com duas ou mais tags marcadas aparece a escolha: “Qualquer uma” (o lead tem pelo menos uma das tags) ou “Todas” (o lead tem todas as tags marcadas). Com um pipeline escolhido, só aparecem as tags daquele funil." },
          { title: "Período de entrada", text: "Filtra pela data em que o lead foi criado no Core (entrada pelo formulário, integração, importação ou cadastro manual), no horário de Brasília. Pode preencher só “De” (dali em diante) ou só “Até” (até aquele dia). Não é a data da venda nem a do último contato." },
          { title: "Tirar e limpar filtros", text: "Cada filtro ativo vira uma etiqueta no topo da página: clique no “x” da etiqueta para tirar só ele. “Limpar”, no painel, tira todos de uma vez. O número ao lado de cada título do painel mostra quantas opções estão marcadas ali." },
        ],
        tips: ["Os totais e a prévia mudam na hora a cada filtro: use-os para conferir antes de exportar."],
      },
      {
        id: "relatorio-exemplos",
        title: "Exemplos de relatórios com filtro",
        summary: "Receitas prontas para as consultas mais comuns.",
        path: "/relatorios",
        steps: [
          { title: "Leads quentes do mês para ligar", text: "Situação: Leads · Pipeline: o funil principal · Temperatura: Quente · Período de entrada: De = dia 1 do mês, Até = hoje. Colunas: Nome, Telefone, Etapa, Próxima tarefa." },
          { title: "Leads esquecidos (sem próximo passo)", text: "Situação: Leads · Tarefas: “Leads sem tarefas em aberto”. Depois, abra cada lead pela prévia (clique na linha) e agende o próximo contato." },
          { title: "Follow-ups atrasados da equipe", text: "Situação: Leads · Tarefas: “Leads com tarefas atrasadas”. Colunas: Nome, Etapa, Tarefas atrasadas, Próxima tarefa." },
          { title: "Resultado de uma campanha", text: "Período de entrada: as datas da campanha · Colunas do grupo Trackeamento (Origem, UTM Source, UTM Campaign, FBCLID/GCLID) + Etapa e Status. No Excel, agrupe pela UTM Campaign." },
          { title: "Vendas ganhas do período", text: "Situação: Clientes · Período de entrada: o período desejado · Colunas: Nome, Empresa, Valor, Origem, Criado em. O total “Valor total” no topo mostra a soma." },
          { title: "Leads frios e de nutrição para reaquecer", text: "Situação: Leads · Temperatura: Frio + Nutrição · Tags: escolha as tags da campanha de nutrição com “Qualquer uma”." },
        ],
      },
    ],
  },

  // ───────────────────────────── CONFIGURAÇÕES
  {
    id: "configuracoes",
    title: "Configurações",
    description: "Aparência da marca, integrações, módulos e consumo.",
    icon: "settings",
    access: "admin",
    articles: [
      {
        id: "aparencia",
        title: "Aplicar a identidade da empresa",
        summary: "Logo e cor da marca em todo o sistema.",
        path: "/configuracoes/aparencia",
        steps: [
          { title: "Abra Aparência", text: "Em “Configurações › Aparência”. Somente o administrador da empresa pode alterar." },
          { title: "Logo da empresa", text: "Em “Logo da empresa”, envie o logo (PNG ou SVG com fundo transparente funciona melhor). Em “Logo para o tema escuro”, envie a versão clara, se tiver." },
          { title: "Cor da marca", text: "Em “Cor da marca”, clique em “Escolher cor” ou digite o “Código (hex)” (ex.: #F5B800). Ela substitui o verde do Core Suite em botões, destaques, card do lead e faixas dos projetos." },
          { title: "Tema escuro", text: "Escolha o “Fundo do tema escuro” e o “Texto sobre o fundo preto”." },
          { title: "Confira e salve", text: "Veja a “Prévia” e salve. Para voltar ao visual original, use “Restaurar padrão Core”." },
        ],
      },
      {
        id: "integracoes",
        title: "Conectar e-mail e Google",
        summary: "Enviar e-mails e sincronizar a agenda.",
        path: "/configuracoes/integracoes",
        steps: [
          { title: "Abra Integrações", text: "Em “Configurações › Integrações”." },
          { title: "Google", text: "Clique em “Conectar minha conta Google”, escolha a conta e autorize Gmail, Google Agenda e Google Drive. Cada pessoa conecta a própria conta." },
          { title: "Outro provedor de e-mail", text: "Sem Google? Use “Outro provedor (IMAP/SMTP)” e informe o e-mail, a senha da caixa, os servidores, as portas e a segurança (SSL/TLS ou STARTTLS) — peça esses dados ao provedor do seu e-mail." },
          { title: "Teste", text: "Envie um e-mail de teste e confira se o status mostra “Conectado”." },
        ],
      },
      {
        id: "modulos-consumo",
        title: "Módulos e consumo",
        summary: "O que a empresa contratou e o espaço usado.",
        path: "/configuracoes/modulos",
        steps: [
          { title: "Módulos", text: "Em “Configurações › Módulos” você vê os módulos ativos da empresa e “Como instalar” os que faltam." },
          { title: "Consumo", text: "Em “Configurações › Consumo”, o administrador acompanha o espaço usado no banco de dados e nos arquivos, com o limite do plano." },
          { title: "Aumente o espaço", text: "Perto do limite (80%), o sistema avisa. Para contratar mais, fale com o suporte do Core Suite." },
        ],
      },
    ],
  },

  // ───────────────────────────── CELULAR
  {
    id: "celular",
    title: "Core Suite no celular",
    description: "Usar o sistema pelo smartphone.",
    icon: "mobile",
    access: "all",
    articles: [
      {
        id: "celular-usar",
        title: "Navegar pelo celular",
        summary: "Menu do rodapé, atalho na tela inicial e uso sem internet.",
        steps: [
          { title: "Menu do rodapé", text: "No celular, o menu fica embaixo: Dashboard, Pipeline, Agenda e Projetos. Toque em “Mais” para as outras áreas, Minhas tarefas, prioridades, valores, tema e esta Central de ajuda." },
          { title: "Instale como aplicativo (iPhone)", text: "No Safari, abra o Core Suite, toque em Compartilhar e em “Adicionar à Tela de Início”." },
          { title: "Instale como aplicativo (Android)", text: "No Chrome, abra o Core Suite, toque nos três pontinhos e em “Adicionar à tela inicial” ou “Instalar app”." },
          { title: "Card do lead no celular", text: "O card abre em tela cheia, com uma rolagem só: dados, respostas, histórico, anotações e, no fim, Tarefas, Arquivos e UTM." },
          { title: "Sem internet", text: "Se a conexão cair, aparece um aviso no topo. Anotações e formulários ficam guardados como rascunho e anexos ficam na fila; tudo é enviado quando a internet voltar." },
        ],
      },
    ],
  },
];

/** Normaliza para busca sem acento e sem diferença de maiúsculas. */
export function normalizeHelp(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Temas e artigos que batem com a busca (título, resumo, passos e dicas). */
export function searchHelp(categories: HelpCategory[], query: string): HelpCategory[] {
  const words = normalizeHelp(query).split(/\s+/).filter(Boolean);
  if (!words.length) return categories;
  return categories
    .map((c) => ({
      ...c,
      articles: c.articles.filter((a) => {
        const text = normalizeHelp(
          [c.title, a.title, a.summary, ...a.steps.flatMap((s) => [s.title, s.text]), ...(a.tips ?? [])].join(" "),
        );
        return words.every((w) => text.includes(w));
      }),
    }))
    .filter((c) => c.articles.length > 0);
}

/** Temas que a pessoa pode ver. */
export function visibleHelp(opts: { projectOnly: boolean; isAdmin: boolean }): HelpCategory[] {
  return HELP_CATEGORIES.filter((c) => {
    if (opts.projectOnly) return c.access === "all";
    if (c.access === "admin") return opts.isAdmin;
    return true;
  });
}
