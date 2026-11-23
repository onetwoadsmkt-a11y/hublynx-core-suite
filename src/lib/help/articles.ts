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
        summary: "Como acessar sua conta e manter a senha segura.",
        steps: [
          { title: "Abra a tela de entrada", text: "Acesse o endereço do Core Suite e informe seu e-mail e senha, ou clique em \"Entrar com Google\" se sua conta usa o Google." },
          { title: "Esqueceu a senha?", text: "Na tela de entrada, clique em \"Esqueceu a senha?\", informe o e-mail e siga o link que chega na sua caixa de entrada." },
          { title: "Troque a senha", text: "Já dentro do sistema, clique na sua foto (canto superior direito) e escolha \"Alterar senha\". Use pelo menos 8 caracteres, misturando letras e números." },
        ],
        tips: ["Não compartilhe a senha: cada pessoa da equipe deve ter o próprio acesso."],
      },
      {
        id: "menu",
        title: "Conhecer o menu e a barra do topo",
        summary: "Onde fica cada área do sistema.",
        steps: [
          { title: "Menu lateral", text: "No computador, o menu fica à esquerda: Dashboard, Pipeline, Leads, Formulários, Agenda, Relatórios, Clientes, Projetos e Configurações. Use o botão de recolher para ganhar espaço." },
          { title: "Busca e notificações", text: "No topo há a busca, o sino de notificações (tarefas e avisos) e o seu perfil." },
          { title: "Valores e tema", text: "O cadeado de \"Valores\" esconde ou mostra os valores em reais na tela — útil para apresentar a tela a outras pessoas. O botão de tema alterna entre claro e escuro." },
          { title: "Mais de uma empresa", text: "Se você participa de mais de uma empresa, use o seletor de empresa no topo do menu para trocar. Pipeline, leads e projetos mudam conforme a empresa escolhida." },
        ],
        tips: ["Se algum item do menu não aparece para você, é porque a sua empresa não tem aquele módulo ou o seu acesso não inclui aquela área. Fale com o administrador da empresa."],
      },
      {
        id: "dashboard",
        title: "Ler o Dashboard",
        summary: "A visão geral da operação e do comercial.",
        path: "/dashboard",
        steps: [
          { title: "Abra o Dashboard", text: "Clique em \"Dashboard\" no menu. Você vê as tarefas do dia, os próximos eventos e os projetos em andamento." },
          { title: "Escolha pipeline e período", text: "No painel comercial, escolha o pipeline e o período. \"Tudo\" mostra a situação atual do funil, sem comparação. A escolha fica salva no seu navegador." },
          { title: "Visão Funil", text: "Troque entre as visões Padrão e Funil. No Funil, defina os \"Objetivos do funil\" do pipeline (o que conta como conversão e o papel de cada etapa) para ver a conversão etapa a etapa." },
          { title: "Vá para o detalhe", text: "Use \"Ver agenda\", \"Ver todas\" e \"Ver todos\" para abrir a lista completa de cada bloco. O painel se atualiza sozinho a cada minuto." },
        ],
      },
    ],
  },
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
          { title: "Abra o Pipeline", text: "Clique em \"Pipeline\" no menu. Se a empresa tiver mais de um funil, escolha qual ver no seletor de pipeline no topo." },
          { title: "Kanban ou Lista", text: "Em \"Visualização\", alterne entre Kanban (colunas por etapa) e Lista (tabela). O sistema lembra a sua escolha." },
          { title: "Mova o lead", text: "No Kanban, segure o card e arraste para outra etapa. Na Lista, troque a etapa direto na linha. Etapas finais (ganho/perda) ficam travadas para arrastar de volta." },
          { title: "Busque e filtre", text: "Use \"Buscar lead, campanha...\" e o botão \"Filtros\" para filtrar por etapas, temperatura, tags, origem do lead, tarefas e data de entrada. \"Limpar filtros\" volta a mostrar tudo." },
          { title: "Ações em vários leads", text: "Clique em \"Selecionar\", marque os cards e escolha \"Mover para…\" ou excluir. A exclusão em massa é só para o administrador da empresa e não apaga leads ligados a projetos." },
        ],
      },
      {
        id: "lead-novo",
        title: "Cadastrar um lead manualmente",
        summary: "Criar um card novo no funil.",
        path: "/pipeline",
        steps: [
          { title: "Clique em \"Novo lead\"", text: "No topo do Pipeline, clique em \"Novo lead\" (ou no \"+\" de uma etapa para já criar nela)." },
          { title: "Preencha os dados", text: "Informe nome, empresa, telefone/WhatsApp, e-mail, cidade/estado, valor e origem. Só o nome é obrigatório, mas quanto mais completo, melhor para o atendimento." },
          { title: "Salve", text: "O card aparece na etapa escolhida. Antes de cadastrar, pesquise em \"Leads\" pelo telefone ou e-mail para não criar o mesmo contato duas vezes." },
        ],
      },
      {
        id: "card-lead",
        title: "Trabalhar no card do lead",
        summary: "Ficha completa: dados, respostas, tarefas, tags e histórico.",
        path: "/pipeline",
        steps: [
          { title: "Abra o card", text: "Clique no lead. A ficha abre ao lado com os dados de cadastro, a qualificação do formulário, as respostas, a campanha/anúncio de origem e a jornada (histórico)." },
          { title: "Edite os dados", text: "Use o lápis \"Editar lead\" para corrigir nome, contato, valor e cidade. Troque a etapa ou o pipeline pelos seletores no topo da ficha." },
          { title: "Fale com o lead", text: "O ícone de WhatsApp abre a conversa no número do lead; o de e-mail abre o envio pelo seu e-mail conectado." },
          { title: "Agende o próximo passo", text: "Em \"Tarefas\", crie uma tarefa, ligação, reunião ou follow-up com data, horário e prioridade. Ela vai para a Agenda e, se o Google estiver conectado, para o Google Agenda." },
          { title: "Tags, notas e arquivos", text: "Adicione tags (configuradas em \"Tags de conversão\"), escreva notas e anexe arquivos. Tudo fica registrado na jornada do lead." },
          { title: "Feche o card", text: "Clique no \"x\" do canto ou aperte Esc. Para abrir o lead numa aba separada, use \"Abrir este lead em outra aba\"." },
        ],
        tips: ["No menu \"…\" do card há \"Exportar jornada (Excel)\" com todo o histórico do lead."],
      },
      {
        id: "duplicados",
        title: "Lead duplicado: conferir e unir",
        summary: "O que fazer quando a mesma pessoa entra mais de uma vez.",
        path: "/pipeline",
        steps: [
          { title: "Identifique o aviso", text: "Quando a mesma pessoa se inscreve de novo (formulário ou integração) com o mesmo telefone ou e-mail, o card novo mostra \"Duplicado?\" / \"Possível contato duplicado\"." },
          { title: "Compare", text: "Clique no aviso para ver lado a lado o card anterior e a nova inscrição." },
          { title: "Una os cards", text: "Clique em \"Unir neste card\". As informações, tarefas e o histórico ficam num só lead. O mesmo envio que chega por dois caminhos (ex.: formulário e Make) em até 30 minutos já é unido automaticamente." },
        ],
      },
      {
        id: "ganho",
        title: "Ganhar um lead e virar cliente/projeto",
        summary: "Converter o lead quando a venda fecha.",
        path: "/pipeline",
        steps: [
          { title: "Mova para a etapa de ganho", text: "Arraste o lead para a etapa final de ganho do funil." },
          { title: "Converta em cliente", text: "Abre a janela \"Converter lead em cliente\": confira nome, empresa, e-mail e telefone." },
          { title: "Crie o projeto", text: "Informe o nome do projeto, a data de início e, se quiser, um \"Modelo de roadmap\" (as etapas e tarefas já entram prontas)." },
          { title: "Portal do cliente", text: "Marque \"Convidar o cliente para o portal\" para ele acompanhar o projeto pelo portal." },
        ],
      },
      {
        id: "configurar-funil",
        title: "Configurar o funil: etapas, tags, layout e pipelines",
        summary: "Ajustar o funil ao processo da empresa.",
        path: "/pipeline",
        steps: [
          { title: "Abra as configurações", text: "No Pipeline, clique no botão de engrenagem \"Configurações\" ao lado de \"Novo lead\"." },
          { title: "Pipelines", text: "Em \"Pipeline\", crie um novo, renomeie ou exclua o pipeline atual." },
          { title: "Etapas", text: "Em \"Configurar funil › Etapas\", crie, renomeie, mude a cor e reordene as etapas. Defina quais são as etapas finais de ganho e de perda." },
          { title: "Layout do card", text: "Em \"Layout do card\", escolha quais informações aparecem no card do Kanban." },
          { title: "Tags de conversão", text: "Em \"Tags de conversão\", clique em \"Nova tag\" para criar as tags usadas no funil, nos filtros e nas automações." },
        ],
      },
      {
        id: "automacoes",
        title: "Criar automações do Kanban",
        summary: "Mover leads, criar tarefas e enviar e-mails sozinho.",
        path: "/pipeline",
        steps: [
          { title: "Abra as automações", text: "No Pipeline, clique em \"Configurações › Automação › Automações do Kanban\" e escolha a etapa." },
          { title: "Quando", text: "Escolha o gatilho: \"Imediatamente ao entrar nesta etapa\", \"Depois de um tempo na etapa\", \"Ao entrar na etapa com uma tag\" ou \"Ao receber uma tag enquanto está nesta etapa\"." },
          { title: "Se (condições)", text: "Opcional. Todas precisam valer: \"Classificação do lead é\" (Quente, Morno, Frio, Nutrição), tags, valor, tem e-mail/telefone, sem tarefas abertas ou com tarefa atrasada. Sem condições, vale para todos os leads da etapa." },
          { title: "Então (ações)", text: "Adicione as ações em ordem: mover de etapa ou de pipeline, adicionar/remover tag, mudar classificação do lead, enviar e-mail (modelo), criar tarefa ou adicionar nota." },
          { title: "Salve e ative", text: "Salve e deixe a chave \"Ativa\" ligada. Em \"Execuções\" você confere o que rodou em cada lead." },
          { title: "Leads que já estavam na etapa", text: "A automação roda quando o lead entra. Para aplicar nos que já estão lá, clique em \"Aplicar aos leads da etapa\" — cada lead só é processado uma vez." },
        ],
        tips: [
          "A classificação vem do formulário de lead scoring. Se o lead chega primeiro sem classificação e ela chega depois, a automação confere de novo sozinha.",
          "Os modelos de e-mail ficam em \"Configurações › Automação › Modelos de e-mail\" e saem pelo seu Gmail conectado.",
        ],
      },
      {
        id: "webhooks",
        title: "Receber leads de fora (Make, Meta, site)",
        summary: "Integrar formulários e anúncios ao funil por webhook.",
        path: "/pipeline",
        steps: [
          { title: "Abra os Webhooks", text: "No Pipeline, clique em \"Configurações › Configurar funil › Webhooks\"." },
          { title: "Receber leads", text: "Na aba \"Receber leads\", crie um webhook, dê um nome, escolha a etapa de destino e a fonte do lead (origem). Copie a URL gerada." },
          { title: "Configure o Make", text: "No Make, use \"HTTP → Make a request\", método POST, formato JSON, colando a URL do Core. Mapeie os campos (nome, telefone, e-mail etc.)." },
          { title: "Enviar eventos", text: "Na aba \"Enviar eventos\", cole a URL de um \"Webhooks → Custom webhook\" do Make para o Core avisar quando algo acontecer com o lead." },
        ],
        tips: ["A URL do webhook funciona como uma senha: não publique em lugares abertos."],
      },
    ],
  },
  {
    id: "leads",
    title: "Leads",
    description: "A lista de todos os contatos, em formato de tabela.",
    icon: "leads",
    access: "crm",
    articles: [
      {
        id: "leads-lista",
        title: "Pesquisar e organizar a lista de leads",
        summary: "Encontrar qualquer contato rápido.",
        path: "/leads",
        steps: [
          { title: "Abra Leads", text: "Clique em \"Leads\" no menu." },
          { title: "Pesquise", text: "Use \"Buscar nome, empresa, e-mail, telefone…\"." },
          { title: "Filtre e ordene", text: "Filtre por pipeline e etapa e ordene por mais recentes, nome (A–Z) ou maior valor." },
          { title: "Abra o lead", text: "Clique na linha para abrir o card completo do lead." },
        ],
      },
    ],
  },
  {
    id: "formularios",
    title: "Formulários",
    description: "Captar e qualificar leads com formulários e lead scoring.",
    icon: "forms",
    access: "crm",
    articles: [
      {
        id: "form-criar",
        title: "Criar e publicar um formulário",
        summary: "Do rascunho ao link público.",
        path: "/formularios",
        steps: [
          { title: "Novo formulário", text: "Em \"Formulários\", clique em \"Novo formulário\", dê um nome (ex.: Campanha de franquias) e escolha o modelo: \"Captação de dados\" (só cadastro) ou \"Qualificação com lead scoring\" (perguntas com pontuação)." },
          { title: "Estrutura e campos", text: "Na aba \"Estrutura\", defina título, subtítulo e a ordem; em \"Campos\", adicione dados pessoais e perguntas, marcando as obrigatórias." },
          { title: "Pontuação e faixas", text: "(Lead scoring) Em \"Pontuação\", dê pontos a cada resposta e configure as faixas de classificação (Quente, Morno, Frio, Nutrição). As faixas não podem se sobrepor nem deixar lacunas." },
          { title: "Lógica", text: "(Lead scoring) Em \"Lógica\", crie regras para pular perguntas ou encerrar a qualificação conforme a resposta." },
          { title: "Destino no CRM", text: "Escolha o pipeline, a etapa de entrada e a origem do lead. Cada envio vira um card com todas as respostas e as UTMs da campanha." },
          { title: "Aparência e encerramento", text: "Em \"Aparência\", ajuste cores, layout (Foco, Dividido, Imersivo) e imagens; em \"Encerramento\", a mensagem e o botão após o envio. A prévia do celular atualiza em tempo real." },
          { title: "Salve e publique", text: "\"Salvar\" guarda o rascunho. \"Publicar\" coloca as mudanças no link público. Use \"Visualizar\" para abrir o formulário como o lead vê." },
        ],
        tips: [
          "Em \"Configurações\" do formulário, informe o ID do Meta Pixel para registrar PageView e Lead nas campanhas.",
          "Enquanto houver mudanças não publicadas, o editor avisa em vermelho.",
        ],
      },
    ],
  },
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
        summary: "Lista, Kanban e calendário das tarefas.",
        path: "/tarefas",
        steps: [
          { title: "Abra a Agenda", text: "Clique em \"Agenda\" no menu. Alterne entre Lista e Kanban; o Kanban separa Vencidas, Hoje, Esta semana, Depois, Sem data e Concluídas." },
          { title: "Crie uma tarefa", text: "Use o \"+\" de uma coluna ou o botão de nova tarefa. Escolha o tipo (tarefa, reunião, ligação, follow-up), data, horário, duração e prioridade. Ligue a um lead ou cliente quando fizer sentido." },
          { title: "Calendário", text: "Abra o calendário para ver o mês, a semana e o dia. Clique num dia para ver o \"Resumo do dia\"." },
          { title: "Conclua ou remarque", text: "Abra a tarefa para concluir, editar a data e hora ou reabrir. Arrastar entre colunas do Kanban também muda o prazo." },
          { title: "Busque e filtre", text: "Use \"Buscar tarefa...\" e os filtros por cliente, tipo e responsável." },
        ],
      },
      {
        id: "prioridades",
        title: "Tarefas prioritárias e alertas",
        summary: "Como funcionam os avisos de prioridade.",
        path: "/tarefas",
        steps: [
          { title: "Marque a prioridade", text: "Ao criar ou editar a tarefa, escolha a prioridade Alta ou Crítica." },
          { title: "Receba o aviso", text: "No dia da tarefa, o sistema mostra um alerta de prioridade ao abrir. Clique em \"Ver prioridades\" para abrir a lista." },
          { title: "Acompanhe as atrasadas", text: "Tarefas vencidas ficam destacadas em vermelho na Agenda e em \"Minhas tarefas\"." },
        ],
      },
      {
        id: "minhas-tarefas",
        title: "Minhas tarefas",
        summary: "Tudo o que foi designado a você, em um lugar só.",
        path: "/minhas-tarefas",
        steps: [
          { title: "Abra \"Minhas tarefas\"", text: "No menu (ou em \"Mais\" no celular). As tarefas aparecem em Atrasadas, Para hoje, Próximas e Sem prazo." },
          { title: "Abra a tarefa", text: "Toque na tarefa: tarefas de projeto abrem direto no projeto, na etapa certa." },
        ],
      },
      {
        id: "google",
        title: "Sincronizar com o Google Agenda",
        summary: "Levar reuniões e tarefas para o seu Google.",
        path: "/configuracoes/integracoes",
        steps: [
          { title: "Conecte sua conta", text: "Em \"Configurações › Integrações\", clique em \"Conectar minha conta Google\" e autorize Gmail, Google Agenda e Google Drive." },
          { title: "Sincronize", text: "Na Agenda, use \"Sincronizar Google\" para trazer e enviar os compromissos." },
          { title: "Crie lead de um evento", text: "Num evento do Google, você pode criar o lead direto pelo calendário." },
        ],
      },
    ],
  },
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
          { title: "Abra Clientes", text: "Clique em \"Clientes\" no menu. Os clientes ganhos no pipeline já aparecem aqui." },
          { title: "Pesquise e filtre", text: "Busque por nome, empresa ou e-mail e filtre por status: Prospecto, Ativo, Inativo ou Inadimplente." },
          { title: "Veja os projetos", text: "A coluna \"Projetos\" mostra o que está em andamento para cada cliente." },
        ],
      },
      {
        id: "portal",
        title: "Liberar o Portal do cliente",
        summary: "O cliente acompanha o projeto pelo link do portal.",
        path: "/portal-clientes",
        steps: [
          { title: "Abra o Portal do cliente", text: "Em \"Administração › Portal do cliente\" (só administradores)." },
          { title: "Libere o acesso", text: "Em \"Acessos\", libere o cliente do projeto. Projetos sem cliente liberado aparecem como \"Só com cliente liberado\"." },
          { title: "Envie o link", text: "Clique em \"Copiar link\" e envie ao cliente. Ele entra pela tela do portal com o próprio e-mail." },
        ],
      },
    ],
  },
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
          { title: "Novo projeto", text: "Em \"Projetos\", clique em \"Novo projeto\" (ou ganhe um lead no pipeline, que cria o projeto junto)." },
          { title: "Dados básicos", text: "Informe o nome, o cliente, o início, o prazo e o valor." },
          { title: "Use um modelo", text: "Escolha um modelo de projeto para já trazer etapas, tarefas padrão e equipe. Os modelos ficam em \"Configurações › Modelos de projeto\"." },
        ],
      },
      {
        id: "projeto-usar",
        title: "Acompanhar o projeto",
        summary: "Etapas, tarefas, equipe, riscos e arquivos.",
        path: "/projetos",
        steps: [
          { title: "Abra o projeto", text: "Clique no projeto na lista. No topo aparecem tarefas concluídas, prazo, equipe e riscos abertos." },
          { title: "Etapas e Kanban", text: "Em \"Etapas\" você vê o roadmap; em \"Kanban\", as tarefas por situação. Clique numa tarefa para editar, comentar e anexar arquivos." },
          { title: "Equipe e permissões", text: "Adicione pessoas com \"Novo membro\" e defina o papel de cada uma." },
          { title: "Riscos, notas e entregas", text: "Registre bloqueios em \"Riscos & Bloqueios\", decisões em \"Notas & Decisões\" e confira \"Próximas entregas\" (7, 15 e 30 dias)." },
          { title: "Arquivos e histórico", text: "Em \"Arquivos\" ficam os documentos; em \"Histórico e mensagens\", toda a comunicação do projeto." },
        ],
        tips: ["Quem é só da equipe de projeto vê apenas Projetos e \"Minhas tarefas\"."],
      },
      {
        id: "modelos",
        title: "Montar modelos de projeto",
        summary: "Padronizar etapas, tarefas e equipe.",
        path: "/configuracoes/modelos",
        steps: [
          { title: "Abra os modelos", text: "Em \"Configurações › Modelos de projeto\", crie um modelo (ex.: Implantação de franquia)." },
          { title: "Etapas e tarefas", text: "Use \"Adicionar etapa\" com fase, prazo e aviso da etapa; dentro de cada uma, adicione as tarefas padrão e quem executa." },
          { title: "Equipe do modelo", text: "Adicione as pessoas ou departamentos que entram em todo projeto desse tipo." },
          { title: "Salve", text: "Clique em \"Salvar modelo\" — sem salvar, a equipe e as etapas não ficam guardadas." },
        ],
      },
    ],
  },
  {
    id: "relatorios",
    title: "Relatórios",
    description: "Exportar o comercial em Excel com filtros.",
    icon: "reports",
    access: "crm",
    articles: [
      {
        id: "relatorio-comercial",
        title: "Gerar o relatório comercial",
        summary: "Filtrar, conferir a prévia e baixar em Excel.",
        path: "/relatorios",
        steps: [
          { title: "Abra Relatórios", text: "Clique em \"Relatórios\" no menu." },
          { title: "Escolha os filtros", text: "Pipeline, etapas, período de entrada, temperatura, situação das tarefas e tags." },
          { title: "Escolha as colunas", text: "Em \"Colunas da planilha\", marque o que vai no arquivo (\"Selecionar tudo\" marca todas)." },
          { title: "Confira e exporte", text: "Veja os totais e a prévia e exporte em Excel." },
        ],
      },
    ],
  },
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
          { title: "Abra Aparência", text: "Em \"Configurações › Aparência\" (somente o administrador da empresa altera)." },
          { title: "Logos", text: "Envie o logo da empresa e, se precisar, um logo para o tema escuro." },
          { title: "Cor da marca", text: "Escolha a cor ou digite o código (hex). Ela substitui o verde do Core Suite em botões, destaques e cards." },
          { title: "Confira a prévia", text: "A prévia mostra o resultado antes de salvar." },
        ],
      },
      {
        id: "integracoes",
        title: "Conectar e-mail e Google",
        summary: "Enviar e-mails e sincronizar a agenda.",
        path: "/configuracoes/integracoes",
        steps: [
          { title: "Google", text: "Em \"Configurações › Integrações\", clique em \"Conectar minha conta Google\" e autorize Gmail, Google Agenda e Google Drive." },
          { title: "Outro provedor", text: "Sem Google? Use \"Outro provedor (IMAP/SMTP)\" e informe os servidores, portas e a segurança (SSL/TLS ou STARTTLS) do seu e-mail." },
          { title: "Teste", text: "Envie um e-mail de teste e confira se o status mostra \"Conectado\"." },
        ],
      },
      {
        id: "modulos-consumo",
        title: "Módulos e consumo",
        summary: "O que a empresa contratou e o espaço usado.",
        path: "/configuracoes/modulos",
        steps: [
          { title: "Módulos", text: "Em \"Configurações › Módulos\" você vê os módulos da empresa e como instalar os que faltam." },
          { title: "Consumo", text: "Em \"Configurações › Consumo\" o administrador acompanha o espaço usado. Para contratar mais, fale com o suporte do Core." },
        ],
      },
    ],
  },
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
        summary: "Menu do rodapé e atalho na tela inicial.",
        steps: [
          { title: "Menu do rodapé", text: "No celular, o menu fica embaixo: Dashboard, Pipeline, Agenda e Projetos. Em \"Mais\" estão as outras áreas, Minhas tarefas, prioridades, valores e tema." },
          { title: "Atalho na tela inicial", text: "No navegador do celular, use \"Adicionar à tela de início\" para abrir o Core Suite como um aplicativo." },
          { title: "Sem internet", text: "Se a conexão cair, o sistema avisa e guarda o que você salvou no aparelho, enviando quando a internet voltar." },
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
