# Plano: Migrar de Lovable Cloud para Supabase externo puro

## Objetivo
Remover a dependência do Lovable Cloud (banco/auth gerenciados) e do broker/gateway Lovable, fazendo o Hublynx Core Suite operar 100% sobre o Supabase externo (`gyxzrnoxzaraossrqyuc.supabase.co`) e OAuth nativo do Google.

## Escopo aprovado pelo usuário
- Google OAuth já configurado no Supabase externo.
- Reescrever conectores Google (Agenda, Gmail, Drive/Sheets) para não usar o gateway Lovable.
- Desativar o Lovable Cloud no projeto.

## Tarefas

### 1. Autenticação com Google via Supabase nativo
- Substituir `lovable.auth.signInWithOAuth` em `src/routes/auth.tsx` por `supabase.auth.signInWithOAuth`.
- Ajustar o fluxo de callback OAuth para usar o redirect padrão do Supabase (`/auth/callback` ou `/dashboard`).
- Remover importação e uso de `@/integrations/lovable/index`.

### 2. Conector Google Calendar sem gateway Lovable
- Em `src/lib/agenda/agenda.functions.ts`, trocar a leitura de eventos do Google Calendar (que hoje usa `LOVABLE_API_KEY` + `GOOGLE_CALENDAR_API_KEY` no gateway) para usar `googleHeaders(userId)` e chamar `https://www.googleapis.com/calendar/v3/calendars/primary/events` diretamente.
- Garantir que `calendar.functions.ts` e `lead-calendar.server.ts` continuem funcionando (já usam OAuth próprio).

### 3. Conector Google Sheets sem gateway Lovable
- Reescrever `src/lib/google/sheets-sync.functions.ts` para usar a API REST do Google Sheets diretamente com o token do usuário (`googleHeaders`).
- Manter a lógica de criação de planilha, escrita de cabeçalhos, upsert de linhas e limpeza.
- Remover as variáveis `LOVABLE_API_KEY` e `GOOGLE_SHEETS_API_KEY` desse fluxo.

### 4. Limpeza de dependências Lovable no código
- Remover `@/integrations/lovable/index.ts` e suas importações.
- Simplificar `src/integrations/supabase/previewAuthStorage.ts` para usar apenas `localStorage` (sem postMessage para o editor Lovable), ou removê-lo se não for mais necessário.
- Remover/atualizar referências a `LOVABLE_API_KEY` nos conectores Google.
- Revisar `src/routes/__root.tsx` para remover `reportLovableError` ou torná-lo genérico.

### 5. Ajustes de configuração e secrets
- Garantir que `src/integrations/supabase/env.ts`, `client.ts`, `client.server.ts` e `auth-middleware.ts` apontem exclusivamente para o Supabase externo.
- Verificar se `EXT_SUPABASE_SERVICE_ROLE_KEY` está cadastrada como secret do Lovable para o ambiente de preview/produção.

### 6. Testes e validação
- Rodar `bun run build` para garantir que não há erros de importação.
- Verificar se o login com Google funciona no preview.
- Verificar se a tela de integrações Google continua conectando/contando serviços.
- Verificar se a sincronização com Google Sheets funciona.

### 7. Desativação do Lovable Cloud
- Como não há tool para desconectar o Cloud, instruir o usuário a acessar **Project Settings > Connectors > Supabase > Disconnect** na interface do Lovable após validação.
- Antes da desconexão, confirmar que todos os dados já foram migrados e o sistema está estável no Supabase externo.

## Riscos e observações
- Senhas antigas do Lovable Cloud não foram migráveis; usuários precisarão redefinir senha por e-mail (exceto `franquias@valesafe.com.br`, já configurada).
- Arquivos anexados (storage) podem precisar de migração separada se ainda estiverem no bucket do Lovable Cloud.
- O login com Google só funcionará após configurar corretamente o Client ID/Secret e a redirect URI no Supabase externo.

## Não incluído neste plano
- Mudanças no módulo financeiro, pipeline, tarefas ou outras áreas que já estão operando no Supabase externo.
- Migração de arquivos do storage (será tratada sob demanda).
