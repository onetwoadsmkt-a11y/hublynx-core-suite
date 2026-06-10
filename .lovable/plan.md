## Objetivo

Transformar `/clientes` (hoje placeholder) numa página completa: lista com filtros, cadastro/edição completos do cliente e anexos de documentos (contratos) por cliente.

A tabela `public.clients` e `public.files` já existem com todos os campos necessários — não há mudança de schema, apenas um bucket de storage novo.

## Layout da página

```text
┌─────────────────────────────────────────────────────────────┐
│ Clientes                                  [+ Novo cliente]  │
├─────────────────────────────────────────────────────────────┤
│ [🔍 Buscar nome/empresa/email] [Status ▾] [Serviço ▾] [⟳]   │
├─────────────────────────────────────────────────────────────┤
│  Cards/grid responsivo:                                     │
│   ┌─────────────────┐  ┌─────────────────┐                  │
│   │ Avatar  Nome    │  │ Avatar  Nome    │                  │
│   │ Empresa · Tag   │  │ Empresa · Tag   │                  │
│   │ ✉ email · ☎ tel │  │ ✉ email · ☎ tel │                  │
│   │ R$/mês · renova │  │ R$/mês · renova │                  │
│   │ [Ver] [Editar]  │  │ [Ver] [Editar]  │                  │
│   └─────────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

Clique em **Ver** abre um **drawer lateral** com 3 abas:

1. **Dados** — todos os campos do cadastro (somente leitura, com botão Editar)
2. **Contratos & Documentos** — lista de anexos + dropzone para upload
3. **Histórico** — projetos, tarefas e finanças vinculados (apenas listagem com links)  
obs: os arquivos deverão estar vinvulados ao google drive

## Filtros

- Busca textual (nome, empresa, email) — debounce 300ms
- Status: ativo / prospecto / inadimplente / inativo / todos
- Serviço (lista única derivada dos clientes existentes)
- Ordenar por: mais recentes / nome A-Z / valor mensal

Estado dos filtros vai para search params da rota (`validateSearch` + `Route.useSearch`), assim a URL é compartilhável.

## Cadastro (dialog grande, em seções)

- **Identificação**: nome*, empresa, status*, serviço
- **Contato**: email, telefone, WhatsApp, Instagram, site, endereço
- **Contrato**: valor mensal, início, renovação
- **Observações**: notas (textarea)

Validação com Zod (nome obrigatório, email válido se preenchido, valor numérico ≥ 0). Mesmo formulário usado para criar e editar.

## Contratos & Documentos

- Bucket novo de storage: `client-documents` (privado, RLS).
- Caminho: `{owner_id}/{client_id}/{uuid}-{filename}`
- Tipos aceitos: PDF, DOC/DOCX, imagens; até 20 MB.
- Cada upload grava em `public.files` com `category='contratos'` e `client_id`.
- Lista mostra: ícone por tipo, nome, tamanho, data, botões **Baixar** (signed URL 60 s) e **Excluir**.

## Histórico

Consultas read-only em `projects`, `tasks` e `finances` filtradas por `client_id`. Cada item linka para a página correspondente.

## Detalhes técnicos

**Arquivos a criar/editar:**

- `src/routes/_authenticated/clientes.tsx` — substitui o placeholder; loader via TanStack Query (`ensureQueryData`) e `useSuspenseQuery` no componente. `validateSearch` com filtros.
- `src/components/clients/ClientCard.tsx` — card da grade.
- `src/components/clients/ClientFormDialog.tsx` — formulário criar/editar (react-hook-form + zod).
- `src/components/clients/ClientDrawer.tsx` — drawer com as 3 abas.
- `src/components/clients/ClientDocumentsTab.tsx` — upload e listagem de documentos.
- `src/components/clients/ClientHistoryTab.tsx` — projetos/tarefas/finanças.
- `src/lib/clients/clients.functions.ts` — server fns: `listClients`, `upsertClient`, `deleteClient`.
- `src/lib/clients/client-documents.functions.ts` — server fns: `listClientDocuments`, `getClientDocumentSignedUrl`, `deleteClientDocument` (upload é direto via supabase client no browser; metadata gravada via server fn `recordClientDocument`).

**Backend (migration):**

- Criar bucket `client-documents` (privado) via `storage_create_bucket`.
- Migration com policies RLS em `storage.objects` para o bucket: dono lê/escreve quando `(storage.foldername(name))[1] = auth.uid()::text`.
- Nenhuma alteração nas tabelas `clients` ou `files` (já têm tudo).

**Padrões do projeto:**

- Toda chamada protegida usa `requireSupabaseAuth` em server fn.
- Cores e componentes via design system (shadcn + tokens semânticos).
- Sonner para toasts.

## Fora de escopo

- Importação CSV de clientes.
- Assinatura eletrônica de contratos.
- Envio automático de e-mail ao cliente (já existe nas tarefas; pode ser feito em iteração futura).