# Estrutura fiscal (NFS-e) — proposta de schema, sem emissão

Objetivo desta etapa: preparar o banco para, no futuro, emitir NFS-e pelo padrão nacional
(DPS → NFS-e). Nada é apagado, renomeado ou duplicado. Nenhum contas a receber novo é criado.
Nenhuma estrutura de empresas é criada: tudo usa `organization_id` e a RLS já existente.

## O que já existe (analisado)

- Empresas em `organizations` + `organization_members`, com funções `is_org_member`,
  `is_org_admin`, `is_super_admin`, `has_module`.
- Todas as tabelas de negócio têm `organization_id` obrigatório, gatilho `fill_organization_id`
  e 4 policies no padrão `org ...`.
- Financeiro: `finances` (competência), `baixas` (caixa), `contas`, `servicos` (linhas de serviço),
  `clients`, `projects`.
- Tela `/financeiro/fiscal` existe apenas como estado vazio.

## O que falta (o que será criado)

Cinco tabelas novas, todas com `organization_id` + gatilho + policies no mesmo padrão.

1. `fiscal_settings` — configuração fiscal por empresa (1 linha por empresa)
   - dados do emitente: CNPJ, inscrição municipal, razão social, nome fantasia, endereço,
     código do município (IBGE), regime tributário, optante Simples, incentivo fiscal.
   - operação: ambiente (`homologacao` | `producao`), provedor/município, série da DPS,
     próximo número da DPS, e-mail para envio, observações padrão.
   - status: `ativo` (default false) — nada é emitido enquanto não for ativado.
   - segredos (certificado A1, senha, tokens) **não** ficam aqui: só a referência
     (`certificate_ref`, validade) — o segredo fica no cofre de secrets do servidor.

2. `fiscal_service_codes` — cadastro fiscal de serviços por empresa
   - código do serviço (LC 116 / código municipal), item da lista, CNAE, descrição,
     alíquota ISS, retenções padrão (ISS/IR/PIS/COFINS/CSLL/INSS), tributação do município,
     `servico_id` opcional apontando para a linha de serviço já existente, `ativo`.

3. `fiscal_documents` — o documento fiscal (DPS e a NFS-e resultante)
   - vínculos opcionais e não obrigatórios: `client_id`, `project_id`, `finance_id`
     (referência ao título já existente — não cria nem duplica contas a receber).
   - identificação: série, número da DPS, `dps_id` (chave de 45 dígitos), competência,
     data de emissão.
   - valores: valor do serviço, deduções, base de cálculo, alíquota, ISS, retenções, valor líquido.
   - resultado: `nfse_numero`, `nfse_chave`, `nfse_codigo_verificacao`, `pdf_url`, `xml_url`,
     `protocolo`, `cancelamento` (motivo/data).
   - `status` com enum próprio: `rascunho`, `pendente`, `processando`, `autorizada`,
     `rejeitada`, `cancelada`, `erro`.
   - unicidade: (empresa, série, número) e (empresa, `dps_id`), ambos parciais para permitir rascunhos.

4. `fiscal_document_items` — itens/serviços do documento
   - descrição, quantidade, valor unitário, valor total, `fiscal_service_code_id`,
     alíquota e ISS do item.

5. `fiscal_events` — trilha de auditoria da emissão
   - documento, tipo do evento (`criado`, `enviado`, `retorno`, `cancelado`, `erro`),
     status resultante, payload de requisição/resposta em `jsonb`, mensagem, `created_by`.

Enums novos: `fiscal_document_status`, `fiscal_environment`.

## Segurança (idêntica ao padrão atual)

Para cada tabela nova:
- `GRANT select, insert, update, delete ... TO authenticated` e `GRANT ALL ... TO service_role`.
- `ENABLE ROW LEVEL SECURITY`.
- 4 policies `org ...` usando `public.is_org_member(organization_id)` para leitura e
  `public.is_org_admin(organization_id)` para escrita em `fiscal_settings` e
  `fiscal_service_codes`; membros podem criar/editar documentos.
- Policy do super admin, como nas demais tabelas.
- Gatilho `trg_fill_org` reaproveitado (`public.fill_organization_id`).
- `fiscal_events` é somente leitura + insert (sem update/delete) para preservar a auditoria.

## O que NÃO será feito agora

- Nenhuma chamada a prefeitura/provedor, nenhuma geração de XML, nenhum certificado no banco.
- Nenhuma alteração em `finances`, `baixas`, `clients`, `projects` ou `servicos`.
- Nenhuma coluna adicionada às tabelas existentes nesta etapa (o vínculo é feito pelas
  chaves em `fiscal_documents`).
- Nenhuma tela nova; `/financeiro/fiscal` continua como está.

## Entrega

Um arquivo `supabase/migrations-org/07_fiscal.sql`, apenas com `create table if not exists`,
enums condicionais, grants, RLS e policies — reexecutável e sem nada destrutivo.
Você roda manualmente no SQL Editor, como nas etapas anteriores.

## Perguntas antes de executar

1. Emissão será por município próprio (ex.: São Paulo) ou pelo padrão nacional (Receita/DPS)?
2. Uma NFS-e pode agrupar vários títulos do financeiro, ou é sempre 1 título = 1 nota?
