-- 20 — Modelo "Implantação de franquia Valesafe — 90 dias" (15/10/2026)
-- Conteúdo da planilha "Cronograma de implantação" (3 fases de 30 dias, 4 semanas cada),
-- adaptado: responsável de cada item (franqueado = Cliente, executa pelo portal;
-- Marketing/Compras/Diretoria = Equipe), prazos dentro da semana e avisos (⚠️).
-- Fica em Configurações → Modelos de projeto da Valesafe Expansão e pode ser editado lá.
-- Rodar DEPOIS da migração 19. Pode rodar mais de uma vez (atualiza o modelo).

begin;

do $seed$
declare
  org uuid := 'bb176c8f-59db-4d67-89ba-9ef29767ae29';
  tpl uuid;
  st uuid;
begin
  if not exists (select 1 from public.organizations where id = org) then
    raise notice 'Empresa Valesafe não encontrada; nada feito.';
    return;
  end if;

  select id into tpl from public.project_templates
   where organization_id = org and name = 'Implantação de franquia Valesafe — 90 dias'
   order by created_at limit 1;
  if tpl is null then
    insert into public.project_templates (organization_id, name, description, active)
    values (org, 'Implantação de franquia Valesafe — 90 dias',
            'Cronograma de implantação em 3 fases de 30 dias, com 4 semanas cada. Itens do franqueado são concluídos por ele no portal.',
            true)
    returning id into tpl;
  else
    update public.project_templates
       set active = true, updated_at = now(),
           description = 'Cronograma de implantação em 3 fases de 30 dias, com 4 semanas cada. Itens do franqueado são concluídos por ele no portal.'
     where id = tpl;
    delete from public.project_template_stages where template_id = tpl; -- leva as tarefas junto
  end if;


  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Fase inicial da implantação', 0, 7, '1ª Fase · Dias 1 a 30', '1ª semana', 0, 'Antes de fechar com o ponto comercial, verifique a disponibilidade de telefone e internet no local e a Lei de Zoneamento Urbano de acordo com o CNAE.')
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Criar os grupos de WhatsApp de integração e de layout do ponto', 'Um grupo de integração com o franqueado e toda a equipe Valesafe, e outro para a definição do layout do ponto comercial.', 6, 0, 'equipe', true),
    (st, org, 'Reunião por vídeo: apresentação da equipe', null, 6, 1, 'equipe', true),
    (st, org, 'Criar o e-mail corporativo', 'Responsável: Marketing.', 6, 2, 'equipe', true),
    (st, org, 'Cadastrar o franqueado na área do franqueado', 'Responsável: Marketing.', 6, 3, 'equipe', true),
    (st, org, 'Enviar as orientações para a busca do ponto comercial', null, 6, 4, 'equipe', true),
    (st, org, 'Escolher o ponto comercial e enviar as imagens à franqueadora', 'Discutimos as preferências e avaliamos as opções até a definição. Espaço interno: posicione-se no centro do salão principal e filme devagar, em giro completo (360°). Espaço externo: foto da fachada e filmagem da rua mostrando o fluxo de pedestres e carros.', 6, 5, 'cliente', true);

  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Ponto comercial, conta e compras', 1, 7, '1ª Fase · Dias 1 a 30', '2ª semana', 7, null)
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Definir o ponto comercial e assinar o contrato de aluguel', null, 6, 0, 'cliente', true),
    (st, org, 'Enviar a planta baixa ou o croqui do ponto à franqueadora', null, 6, 1, 'cliente', true),
    (st, org, 'Abrir o CNPJ (ou adequar o CNPJ já existente)', null, 6, 2, 'cliente', true),
    (st, org, 'Enviar ao Departamento de Compras a documentação para cadastro nos fornecedores homologados', 'O Departamento de Compras entra em contato. O cadastro é feito em até 10 dias.', 6, 3, 'cliente', true),
    (st, org, 'Abrir a conta corrente Pessoa Jurídica', 'No banco de sua preferência.', 6, 4, 'cliente', true),
    (st, org, 'Reunião de integração sobre o setor de compras e seus processos', 'Responsável: Compras.', 6, 5, 'equipe', true);

  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Ponto comercial e compras', 2, 7, '1ª Fase · Dias 1 a 30', '3ª semana', 14, null)
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Entregar o escopo da fachada da loja', 'Responsável: Marketing. Prazo de 5 dias.', 4, 0, 'equipe', true),
    (st, org, 'Analisar e aprovar as compras do estoque inicial', 'Estoque formado por itens de commodities e por itens ligados às demandas da sua região, montado a partir de estudo regional e contato com o franqueado. Prazo de 2 a 5 dias.', 4, 1, 'cliente', true),
    (st, org, 'Iniciar o processo de compras', 'Responsável: Compras.', 6, 2, 'equipe', true),
    (st, org, 'Entregar o projeto arquitetônico', 'Prazo de 15 dias após o envio da planta baixa ou do croqui.', 6, 3, 'equipe', true),
    (st, org, 'Comprar ou contratar a fabricação das prateleiras do estoque e do balcão', null, 6, 4, 'cliente', true),
    (st, org, 'Encomendar a mesa de separação', null, 6, 5, 'cliente', true),
    (st, org, 'Encomendar a tela expositora', null, 6, 6, 'cliente', true);

  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Ponto comercial: execução das adaptações', 3, 9, '1ª Fase · Dias 1 a 30', '4ª semana', 21, null)
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Iniciar as adaptações do ponto comercial (fachada e pintura)', 'Buscar mão de obra, fazer as cotações e executar os trabalhos.', 8, 0, 'cliente', true),
    (st, org, 'Reunião de alinhamento com o Marketing sobre o conteúdo da montagem da loja', 'O conteúdo da montagem será usado depois para alimentar o Instagram da unidade.', 8, 1, 'equipe', true);

  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Compras e treinamentos', 4, 7, '2ª Fase · Dias 31 a 60', '1ª semana', 30, 'Contratação da equipe: cabe ao franqueado conhecer a sua região para escolher o momento certo de contratar. Toda a equipe precisa estar contratada 15 dias antes do início da operação.')
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Comprar 2 computadores, celular, impressora A4 e impressora térmica', 'Especificações no Manual do Franqueado.', 6, 0, 'cliente', true),
    (st, org, 'Contratar internet e telefonia', null, 6, 1, 'cliente', true),
    (st, org, 'Treinamento de acesso à área do franqueado', 'Responsável: Marketing.', 6, 2, 'equipe', true);

  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Treinamento e estrutura', 5, 7, '2ª Fase · Dias 31 a 60', '2ª semana', 37, null)
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Fazer as aulas da área do franqueado: formação de preço e entrada de NF', 'Tema 1: formação de preço. Tema 2: entrada de NF (reforço do treinamento GSOFT).', 6, 0, 'cliente', true),
    (st, org, 'Prioridade total nas adaptações do ponto comercial', null, 6, 1, 'cliente', true);

  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Treinamentos e acompanhamento da obra', 6, 7, '2ª Fase · Dias 31 a 60', '3ª semana', 44, null)
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Acompanhar a obra e dar retorno à franqueadora', null, 6, 0, 'cliente', true),
    (st, org, 'Treinamento de EPIs e EPCs', 'Informações técnicas: o que é o C.A., como funciona a regularização, como saber se o C.A. está vencido e o que significam as siglas e os desenhos de identificação dos EPIs.', 6, 1, 'equipe', true),
    (st, org, 'Gravar vídeo técnico de EPIs para o treinamento', 'Sugestão da equipe: um vídeo curto explicando C.A., regularização, validade e identificação dos EPIs, para usar no treinamento.', 6, 2, 'equipe', false),
    (st, org, 'Reunião para definir as ações antes da inauguração', 'Responsável: Marketing.', 6, 3, 'equipe', true);

  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Sistema e marketing da inauguração', 7, 9, '2ª Fase · Dias 31 a 60', '4ª semana', 51, null)
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Instalar o sistema GSOFT', 'Prazo de 7 dias.', 6, 0, 'equipe', true),
    (st, org, 'Criar o Instagram e o Google Meu Negócio da unidade', 'Responsável: Marketing.', 8, 1, 'equipe', true),
    (st, org, 'Iniciar a produção dos materiais gráficos da inauguração', 'Banners, folders e materiais sobre pautas regionais para o Instagram. Responsável: Marketing.', 8, 2, 'equipe', true);

  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Recebimento de mercadoria, organização e sistema', 8, 7, '3ª Fase · Dias 61 a 90', '1ª semana', 60, null)
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Enviar o direcionamento de organização do estoque nas prateleiras', 'Responsável: Diretoria.', 6, 0, 'equipe', true),
    (st, org, 'Monitorar a chegada da mercadoria', 'Responsável: Compras.', 6, 1, 'equipe', true),
    (st, org, 'Treinamento GSOFT: cadastros', null, 6, 2, 'equipe', true),
    (st, org, 'Treinamento GSOFT: contas a pagar e a receber', null, 6, 3, 'equipe', true),
    (st, org, 'Treinamento GSOFT: estoque', null, 6, 4, 'equipe', true),
    (st, org, 'Treinamento GSOFT: NF-e de entrada', null, 6, 5, 'equipe', true),
    (st, org, 'Treinamento GSOFT: emissões fiscais', null, 6, 6, 'equipe', true);

  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Compras, sistema, financeiro e estrutura', 9, 7, '3ª Fase · Dias 61 a 90', '2ª semana', 67, null)
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Check-list sistêmico do GSOFT', 'Responsável: Compras.', 6, 0, 'equipe', true),
    (st, org, 'Comprar a papelaria', 'Conforme o Manual do Franqueado.', 6, 1, 'cliente', true),
    (st, org, 'Contratar a maquininha de cartão', null, 6, 2, 'cliente', true),
    (st, org, 'Enviar o vídeo da loja montada para aprovação', null, 6, 3, 'cliente', true);

  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Equipe, treinamento e check-list final', 10, 7, '3ª Fase · Dias 61 a 90', '3ª semana', 74, null)
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Equipe contratada e exames admissionais agendados', null, 6, 0, 'cliente', true),
    (st, org, 'Confeccionar os uniformes', 'Indicado: 5 por pessoa (mínimo 3).', 6, 1, 'cliente', true),
    (st, org, 'Treinamento PROJETO SIGA com o franqueado', null, 6, 2, 'equipe', true),
    (st, org, 'Check-list final da chegada de mercadoria', null, 6, 3, 'equipe', true),
    (st, org, 'Check-list final das compras: equipamentos e papelaria', null, 6, 4, 'equipe', true),
    (st, org, 'Preparar o material "O que se espera do franqueado / rotina do gestor"', 'Material para fazer parte do treinamento. Responsável: Diretoria.', 6, 5, 'equipe', false);

  insert into public.project_template_stages
    (template_id, organization_id, name, sort_order, duration_days, phase, week_label, start_offset_days, alert)
  values (tpl, org, 'Treinamentos e visita técnica', 11, 9, '3ª Fase · Dias 61 a 90', '4ª semana', 81, null)
  returning id into st;
  insert into public.project_template_tasks
    (stage_id, organization_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client)
  values
    (st, org, 'Treinamento financeiro', 'Contas a pagar, movimentação bancária e contas a receber.', 8, 0, 'equipe', true),
    (st, org, 'Treinamento PROJETO SIGA com o vendedor', null, 8, 1, 'equipe', true),
    (st, org, 'Visita técnica na unidade pronta: validação dos processos e treinamento final', null, 8, 2, 'equipe', true);

end
$seed$;

commit;
