# Pipeline — mapeamento configurável dos campos do lead

## O que está acontecendo hoje

Consultei os leads recebidos: nos três últimos registros o **payload inteiro chegou dentro do campo `name`** (nome + telefone + e-mail + cidade + estado + data em uma única string), e `email`, `phone`, `company` e todos os `utm_*` ficaram vazios. Um lead chegou até com o nome literal `name, email, phone, company, value, utm_source, ...` — ou seja, o Make enviou a *lista de rótulos*, não os valores.

Causa: o endpoint atual só reconhece um conjunto fixo de nomes de chave (`name/nome`, `email`, `phone/telefone`…) e só no nível raiz do JSON. Quando o Make manda o formulário como texto colado num único campo, ou com chaves próprias (`Nome completo`, `field_1`, `data.contact.email`), nada bate e tudo cai no primeiro campo encontrado. Os UTMs não têm rastreio porque o formulário/Make não envia essas chaves com esses nomes exatos.

## Solução: configurar o recebimento por webhook

### 1. Capturar o último payload recebido
Cada webhook de entrada passa a guardar o **último JSON recebido** (bruto). No diálogo de Webhooks aparece um bloco "Último recebimento" com o horário e o JSON, e um botão "Aguardar teste" — o usuário dispara um envio no Make e o payload aparece na tela.

### 2. Mapeador visual de campos
Com o payload capturado, o sistema lista as chaves detectadas (incluindo caminhos aninhados como `body.contact.email`) e o usuário associa cada campo do lead à chave de origem, via select:

```text
Nome        →  [ nome_completo        ▾ ]   "Rafael Santos"
E-mail      →  [ email                ▾ ]   "hublynx.dev@gmail.com"
Telefone    →  [ whatsapp             ▾ ]   "12981268685"
Empresa     →  [ (não usar)           ▾ ]
Valor       →  [ (não usar)           ▾ ]
Cidade      →  [ cidade               ▾ ]   "Taubaté"
Estado      →  [ uf                   ▾ ]
Origem      →  [ fixo: "Formulário"       ]
utm_source  →  [ utm_source           ▾ ]
utm_medium  →  [ utm_medium           ▾ ]
utm_campaign→  [ utm_campaign         ▾ ]
utm_term / utm_content / gclid / fbclid / landing_url / referrer
```

Cada linha mostra um **preview do valor real** do último payload, então dá para conferir antes de salvar. Campos sem mapeamento continuam usando a detecção automática atual (fallback por nomes comuns em PT/EN).

### 3. Extração de UTM do link
Quando o formulário não envia UTMs separados mas manda a URL da página (`landing_url`/`page_url`), o endpoint passa a **ler os parâmetros `utm_*`, `gclid` e `fbclid` da query string** dessa URL automaticamente. Isso resolve o rastreio na maioria dos formulários.

### 4. Higienização do que já entrou
- Normalização no recebimento: `name` limitado a uma linha (se vier texto multi-linha, tenta separar e-mail/telefone por regex e joga o resto em observação do lead).
- Botão "Reprocessar último payload" para testar o mapeamento sem precisar reenviar do Make.
- Os leads bagunçados já criados podem ser excluídos manualmente no board (não vou apagar nada automaticamente).

### 5. Card do lead padronizado
O card já exibe nome, empresa, telefone, e-mail, valor, origem e campanha — o problema é só o dado chegar vazio. Com o mapeamento correto, os cards ficam iguais ao do "OnteTwo Ads & Content". Ajuste visual pequeno: limitar o nome a 2 linhas e mostrar badge de UTM medium quando houver.

## Detalhes técnicos

**Migração** — em `lead_webhooks`: `field_map jsonb not null default '{}'`, `last_payload jsonb`, `last_payload_at timestamptz`.

**`src/routes/api/public/leads/$token.ts`** — achatar o payload em caminhos (`a.b.c`), gravar `last_payload`, aplicar `field_map` (com suporte a valor fixo `{"const":"..."}`), depois o fallback de nomes atual, e por fim extrair UTMs da `landing_url`. Validação Zod mantida.

**`src/lib/pipeline/pipeline.functions.ts`** — `updateWebhookMapping` (salva `field_map`), `getWebhookPayload` (lê último payload), `reprocessLastPayload`.

**`src/components/pipeline/WebhooksDialog.tsx`** — nova seção "Mapear campos" por webhook de entrada, com selects por campo do lead, preview de valores e botão de reprocessar.

**`src/components/pipeline/LeadCard.tsx`** — clamp de 2 linhas no nome, badge de utm_medium.

## Fora de escopo
- Reprocessar retroativamente os leads antigos já gravados errados.
- Deduplicação de leads por e-mail/telefone.
