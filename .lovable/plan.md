# Inverter colunas do card do lead

Trocar a posição das duas áreas no modal de tela cheia do lead (`LeadDrawer`).

## Nova disposição

```text
+---------------------------------------------+----------------------+
| Dados do lead (cabeçalho verde/azul)         |  Agendamentos        |
| Histórico da jornada (timeline, rolagem)     |  (Tarefas / Arquivos |
|                                              |   / UTM em abas)     |
+---------------------------------------------+----------------------+
| Anotações (caixa de texto + Adicionar)       |                      |
+---------------------------------------------+----------------------+
```

- Coluna esquerda (principal): cartão com telefone, e-mail, cidade e origem, seguido do
  Histórico da jornada com rolagem própria e o botão "Ver nota".
- Rodapé da coluna esquerda: seção "Anotações" com a caixa de texto e o botão Adicionar,
  exatamente como está hoje.
- Coluna direita (lateral): abas Tarefas (agendamento e lista de reuniões), Arquivos e UTM,
  com o formulário de agendar, seleção de tipo, data, duração e o convite por e-mail.

## Detalhes técnicos

- Alteração apenas visual em `src/components/pipeline/LeadDrawer.tsx`; nenhuma query,
  função de servidor ou tabela muda.
- Inverter o grid `lg:grid-cols-[minmax(0,1fr)_380px]` movendo o bloco `<Tabs>` para o
  `<aside>` e a timeline para a coluna principal; a lateral passa para ~420px para caber
  o formulário de agendamento, com rolagem interna.
- No mobile (uma coluna) a ordem passa a ser: dados → jornada → anotações → agendamentos,
  mantendo tudo acessível por rolagem.
