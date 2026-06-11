# Plano: Dashboard real + Workspaces por usuário + Admin

## 1. Workspaces por usuário (já parcialmente pronto)

O isolamento por usuário **já existe**: todas as tabelas (`tasks`, `projects`, `clients`, `finances`, `events`, etc.) têm `owner_id` com RLS escopada por `auth.uid() = owner_id`. Cada usuário cadastrado já vê apenas seus próprios dados — é a "área de trabalho" individual.

Vou apenas reforçar:
- Garantir que toda inserção (via formulários) seta `owner_id = auth.uid()` (auditar pontos faltantes em projetos/finanças/eventos se houver).
- Mostrar nome da workspace no header (já mostra o nome do usuário).

## 2. Admin: hublynx.dev@gmail.com

**Migration:**
- Promover o usuário `hublynx.dev@gmail.com` para role `admin` em `user_roles` (upsert via lookup em `auth.users`).
- Criar função `is_admin()` SECURITY DEFINER que checa se `auth.uid()` tem role admin.
- Adicionar policies extras nas tabelas principais (`profiles`, `user_roles`, `projects`, `tasks`, `clients`, `finances`, `events`) permitindo `SELECT/UPDATE/DELETE` quando `is_admin()`. Não duplica — soma à policy existente de owner.
- View `admin_users_overview` (security invoker) com: `id, email, full_name, created_at, last_sign_in_at, role, contagens (projetos/tarefas/clientes)` — alimentada via join em `auth.users` + agregados.

**Server functions (`src/lib/admin/admin.functions.ts`):**
- `listUsers()` — usa `requireSupabaseAuth` + check `is_admin`, lê via `supabaseAdmin` (`auth.admin.listUsers` + agregados).
- `setUserRole({ userId, role })` — promove/rebaixa.
- `deleteUser({ userId })` — `supabaseAdmin.auth.admin.deleteUser` (cascata remove dados via FK).

**UI nova:**
- Rota `/_authenticated/admin.usuarios.tsx` — tabela de usuários com role, contadores, ações (mudar role, excluir).
- Item de menu "Admin → Usuários" no sidebar, **visível só se `useQuery` retornar `is_admin = true`** (hook `useIsAdmin`).

## 3. Dashboard real (substituir todos os mocks)

Reescrever `src/routes/_authenticated/dashboard.tsx` para usar dados reais via `useQuery` ao Supabase, escopados por RLS (cada usuário vê só o seu; admin vê o seu também — admin global é página separada).

**KPIs (cards superiores):**
| Card | Query |
|---|---|
| Tarefas para hoje | `tasks` onde `due_date::date = hoje AND status <> 'concluido'`. Sub: contagem de `due_date < hoje AND status <> 'concluido'` (em atraso). |
| Projetos ativos | `projects` onde `status = 'ativo'`. Sub: atrasados (`due_date < hoje AND status NOT IN ('concluido','cancelado')`). |
| A receber (7 dias) | soma `finances.amount` onde `kind='receita' AND status='pendente' AND due_date BETWEEN hoje E hoje+7`. Sub: contagem. |
| Reuniões hoje | `events` onde `start_at::date = hoje AND event_type IN ('reuniao','call')`. Sub: próximo horário. |
| Clientes ativos | `clients` onde `status='ativo'`. |

**Seções:**
- **Tarefas do dia**: lista de `tasks` de hoje (até 6), com checkbox que faz `UPDATE status='concluido'`. Mostra cliente + projeto via join.
- **Financeiro**: 3 linhas reais — Receber semana, Pagar semana, Saldo previsto. Cada uma com sparkline dos últimos 7 dias (agregado por dia).
- **Projetos em andamento**: top 5 `projects` com `status='ativo'`, mostrando `progress` real e nome do cliente.
- **Próximos eventos**: próximos 4 `events` com `start_at >= now()`.

**Saudação:** Bom dia/Boa tarde/Boa noite baseado em horário local + primeiro nome do `profiles.full_name`.

**Estados vazios:** cada seção mostra mensagem amigável ("Nenhuma tarefa para hoje", "Sem projetos ativos ainda", etc.) e CTA para criar.

## 4. Arquivos afetados

```text
supabase/migrations/<timestamp>_admin_setup.sql           (novo)
src/lib/admin/admin.functions.ts                          (novo)
src/hooks/useIsAdmin.ts                                   (novo)
src/routes/_authenticated/admin.usuarios.tsx              (novo)
src/components/AppShell.tsx                               (item admin no NAV condicional)
src/routes/_authenticated/dashboard.tsx                   (reescrita completa, sem mocks)
```

## 5. Confirmar antes de começar

1. **Email admin**: confirmar que é exatamente `hublynx.dev@gmail.com` (esse usuário já precisa ter feito sign-up no sistema — se ainda não, eu crio o trigger que promove automaticamente quando ele se cadastrar).
2. **Escopo do admin**: ver e gerenciar **usuários** (role, excluir). Você quer também que o admin consiga **ver os dados** (projetos/tarefas/finanças) de outros usuários? Ou apenas gerenciar contas?
