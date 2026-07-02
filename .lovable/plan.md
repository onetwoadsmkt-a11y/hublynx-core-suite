
# Modularização — cada módulo como PWA instalável

## Ideia geral

Hoje o sistema é um único PWA (`/`) mais o mobile de Tarefas (`/app`). Vamos padronizar: **cada módulo vira um PWA próprio**, com URL dedicada, manifest, ícone, cor de tema e nome próprios. Quem instalar só "Hublynx Financeiro" abre direto no financeiro; quem instalar "Hublynx Core" continua com o pacote integrado. Nada de módulo desaparece do sistema — todos coexistem e continuam integrados no banco.

## Módulos e URLs

| Módulo         | Rota base (scope PWA) | Nome instalado       | Cor tema  |
| -------------- | --------------------- | -------------------- | --------- |
| Core (pacote)  | `/`                   | Hublynx Core         | `#071A3D` |
| Tarefas        | `/m/tarefas/`         | Hublynx Tarefas      | `#00D084` |
| Projetos       | `/m/projetos/`        | Hublynx Projetos     | `#6366F1` |
| Financeiro     | `/m/financeiro/`      | Hublynx Financeiro   | `#0EA5E9` |
| Clientes       | `/m/clientes/`        | Hublynx Clientes     | `#F59E0B` |
| Agenda         | `/m/agenda/`          | Hublynx Agenda       | `#EF4444` |
| Hub Central    | `/m/hub/`             | Hublynx Hub          | `#071A3D` |

O `/app` (Central de Tarefas mobile atual) é mantido como shell mobile-first do módulo Tarefas — o novo `/m/tarefas/` redireciona para `/app` em mobile e serve a versão desktop em telas grandes.

## Como funciona o "individualizar"

1. **Manifest por módulo** em `public/manifests/{modulo}.webmanifest`, cada um com `scope` e `start_url` próprios (`/m/tarefas/`, `/m/financeiro/`, …), nome, short_name, cor, ícones. O browser trata cada scope como um app instalável distinto — instalar um não instala o outro.
2. **Layout `_module.tsx`** monta o `<link rel="manifest">`, `theme-color` e `apple-touch-icon` correto conforme a rota atual (`/m/{slug}/*`). O manifest do Core só é injetado quando fora de `/m/*`.
3. **Menu lateral** ganha um seletor "Módulo" no topo. Dentro de um módulo, o menu mostra só as sub-páginas dele + botão "Voltar ao Core".
4. **CTA "Instalar este módulo"** aparece no header/mais de cada módulo usando `beforeinstallprompt` — cada scope dispara seu próprio evento.
5. **Módulos bloqueados**: mantemos todos ativos por padrão (conforme você decidiu). O menu do Core mostra todos os módulos, mas se o usuário desativar algum em Configurações → Módulos, o item aparece com cadeado e CTA "Ativar módulo" que só liga a flag local (sem billing por enquanto).
6. **Integração preservada**: como todos os módulos batem no mesmo Supabase, tarefa criada no PWA de Tarefas continua aparecendo em Projetos, Agenda e Financeiro no PWA do Core. Nada é duplicado.

## Estrutura de rotas

```text
src/routes/_authenticated/
  m.tsx                        # layout de módulo (injeta manifest correto)
  m.tarefas.tsx                # redireciona conforme viewport (mobile→/app, desktop→shell)
  m.tarefas.$.tsx              # espelha sub-rotas de /tarefas
  m.projetos.tsx / .$.tsx
  m.financeiro.tsx / .$.tsx
  m.clientes.tsx / .$.tsx
  m.agenda.tsx / .$.tsx
  m.hub.tsx
```

Em vez de duplicar telas, cada `m.{modulo}.tsx` renderiza o mesmo componente da rota atual dentro do shell de módulo. As rotas antigas (`/tarefas`, `/financeiro`, …) continuam funcionando no Core.

## Configuração por usuário

Nova tabela `user_modules` (Supabase):

- `user_id uuid` (FK auth.users)
- `module_slug text` (`tarefas`, `projetos`, `financeiro`, `clientes`, `agenda`, `hub`)
- `enabled boolean default true`
- `installed_at timestamptz` (nulo até o usuário instalar)
- RLS: `user_id = auth.uid()` + GRANTs `authenticated`/`service_role`.

Página `Configurações → Módulos`: lista todos com toggle "Ativo no menu" e botão "Instalar como app" (dispara o prompt no scope certo).

## Comportamento quando desativado

- Item do menu aparece com ícone de cadeado + tooltip "Módulo desativado".
- Ao clicar, abre modal com CTA "Ativar módulo" → grava `enabled=true`.
- Rota direta `/m/{modulo}/*` mostra uma tela de "Módulo desativado — Ativar agora" em vez de 404 (para não quebrar link salvo).

## Arquivos novos

- `public/manifests/tarefas.webmanifest` (renomeia `manifest-tarefas.webmanifest`)
- `public/manifests/{projetos,financeiro,clientes,agenda,hub}.webmanifest`
- `public/icons/{modulo}-192.png` + `{modulo}-512.png` (gerados na paleta do módulo)
- `src/routes/_authenticated/m.tsx` (layout)
- `src/routes/_authenticated/m.{modulo}.tsx` + `m.{modulo}.$.tsx`
- `src/routes/_authenticated/configuracoes.modulos.tsx`
- `src/components/modules/ModuleGate.tsx` (bloqueio + CTA ativar)
- `src/components/modules/InstallModuleButton.tsx`
- `src/lib/modules/modules.ts` (registry central com slug, nome, cor, ícone, rotas)
- `src/lib/modules/modules.functions.ts` (server fns: listar/toggle/marcar instalado)

## Arquivos editados

- `src/routes/__root.tsx` — remove manifest fixo; passa a decidir manifest via layout de módulo.
- `src/routes/_authenticated/app.tsx` — usa o manifest de `tarefas` em vez do próprio.
- `src/components/AppShell.tsx` — seletor de módulo + itens com cadeado + "Instalar como app".
- `public/manifest.webmanifest` — vira só o manifest do Core (pacote completo).

## Migração DB

```sql
create table public.user_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_slug text not null,
  enabled boolean not null default true,
  installed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_slug)
);
grant select, insert, update, delete on public.user_modules to authenticated;
grant all on public.user_modules to service_role;
alter table public.user_modules enable row level security;
create policy own_user_modules on public.user_modules
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

## Fora do escopo (agora)

- Billing/planos pagos por módulo (só flag local por enquanto).
- Modo offline dedicado por módulo (mantém a política atual sem service worker de app-shell; push worker existente segue igual).
- Reescrever telas — só empacotamos as existentes em cada shell de módulo.

## O que você vai perceber

- No `/configuracoes/modulos`, ligar/desligar cada módulo e clicar "Instalar como app" para cada um separadamente.
- No celular, instalar "Hublynx Financeiro" abre um app com ícone azul e vai direto pro dashboard financeiro; instalar "Hublynx Core" abre o pacote completo.
- Nada se perde: quem usa tudo continua com o sistema integrado no `/`.
