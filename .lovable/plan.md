## Reestruturar a página `/auth` conforme a imagem

A página atual já tem o split 50/50, mas o conteúdo dos dois lados precisa ser ajustado para bater exatamente com a referência.

### Painel esquerdo (fundo azul-escuro)
- Logo Hublynx no topo (já existe).
- Título: **"O sistema operacional do seu negócio."**
- Subtítulo: "Tarefas, projetos, clientes, financeiro e agenda em um único lugar. Substitua Trello, planilhas e agendas de papel."
- Grade 2×2 com 4 cards translúcidos (border branca/10, fundo branco/5, radius arredondado):
  - **TAREFAS** — Kanban + Lista
  - **PROJETOS** — Andamento em %
  - **FINANCEIRO** — A pagar / receber
  - **AGENDA** — Reuniões e calls
  Cada card tem um pequeno rótulo verde (`#00D084`, uppercase, tracking wide) acima do texto branco.
- Rodapé: "© 2026 Hublynx Group" em branco/40.

### Painel direito (fundo branco)
- Tabs no topo: **Entrar** | **Criar conta** (full width, igual atual).
- Título: **"Bem-vindo de volta!"**
- Subtítulo em verde: "Acesse o seu Hublynx Core."
- Formulário Entrar:
  - Campo E-mail (placeholder `voce@empresa.com`)
  - Linha Senha + link "Esqueceu a senha?" à direita (verde)
  - Botão **Entrar** verde full width
- Abaixo do botão: "Não tem uma conta? **Criar conta**" centralizado (o link troca para a tab de cadastro).
- Remover o `Card` com borda/sombra — conteúdo flui direto, sem moldura, para ficar idêntico à referência.
- Mobile (<lg): mostra a logo no topo do painel direito e oculta o painel esquerdo (já é o comportamento atual).

### Arquivo afetado
- `src/routes/auth.tsx` (apenas markup/estilos; lógica de login/signup/reset preservada).

Sem mudanças em banco, rotas ou outros componentes.