# Configuração de tags para medir conversão

Hoje o dashboard comercial calcula o funil adivinhando o significado de cada etapa pelo nome ("reunião", "no show", "ganho"...). A ideia é passar a usar **tags marcadas manualmente em cada lead**, que ficam registradas mesmo depois do lead avançar, e continuam somando com as etapas do pipeline.

## Como vai funcionar

1. **Cadastro de tags por pipeline** — em Pipeline → Configurações entra a aba "Tags". Ali você cria as tags (nome, cor) e escolhe o que cada uma representa no funil: Entrada, Conectado, Reunião agendada, Reunião realizada, No show, Proposta/COF, Ganho, Desqualificado, Nutrição ou "Nenhum" (tag só de organização). Dá para editar, reordenar e desativar.
2. **Marcar no lead** — no card do lead aparece um seletor de tags do pipeline (várias por lead). As tags já ficam salvas hoje no lead, então nada se perde.
3. **Acumula histórico** — como a tag só sai se você retirar, um lead que virou "ganho" continua contando em "reunião realizada" se a tag estiver lá.
4. **Dashboard** — cada indicador (conectados, agendadas, realizadas, no show, propostas, ganhos, perdidos) passa a contar o lead quando **a tag correspondente estiver marcada OU a etapa atual/já alcançada indicar aquilo**, sem contar o mesmo lead duas vezes. As taxas de conexão, reunião, no show e conversão saem desse número combinado.
5. **Transparência** — cada cartão do dashboard mostra de onde veio o número (por tag / por etapa), e um seletor no topo permite ver "Tags + etapas" (padrão), "Só tags" ou "Só etapas", para comparar.

## Detalhes técnicos

**Banco (Supabase externo)** — uma tabela nova `pipeline_tags`:
`id`, `pipeline_id` (FK), `owner_id`, `workspace_id`, `name`, `slug`, `color`, `funnel_key` (enum textual das chaves de `funnel.ts` + `nenhum`), `position`, `active`, timestamps. GRANTs para `authenticated`/`service_role`, RLS espelhando a política atual de `pipelines` (`auth.uid() = owner_id`), sem tocar nas políticas existentes. Os leads continuam usando a coluna `leads.tags` (`text[]`), casada com `pipeline_tags.slug` — nada de migração de dados.

**Backend**
- `src/lib/pipeline/tags.functions.ts`: `listPipelineTags`, `upsertPipelineTag`, `deletePipelineTag`, todas com `requireSupabaseAuth` e escopo de workspace.
- `dashboard.functions.ts`: incluir `tags` no select de leads e devolver a lista de `pipeline_tags` do pipeline atual.

**Funil** — `src/lib/pipeline/funnel.ts` ganha um segundo caminho de classificação: `computeFunnel(stages, leads, { tags, mode })`. Para cada lead, resolve o conjunto de chaves alcançadas pela etapa (progressão atual, como hoje) unido com as chaves das tags marcadas, e conta cada chave uma única vez. Regras de taxa permanecem as mesmas.

**Frontend**
- `src/components/pipeline/TagsDialog.tsx` (nova aba dentro das Configurações do pipeline) com CRUD das tags.
- `LeadFormDialog` / `LeadDrawer`: seletor múltiplo das tags do pipeline gravando em `leads.tags`; `LeadCard` mostra as tags com a cor definida.
- `comercial.dashboard.tsx`: seletor de modo (Tags + etapas / Só tags / Só etapas), passa `tags` e `mode` para `computeFunnel`, e um bloco novo "Conversão por tag" com contagem e percentual sobre o total de leads do período.
- Relatórios já exportam `tags`; nada muda lá.

Sem polling; as consultas são invalidadas ao salvar tag ou lead.
