## Diagnóstico

O e-mail de teste UTF-8 chega bem porque é um HTML completo (`<!doctype html><html><body>…`). Já o envio da tarefa (`src/lib/google/gmail.functions.ts`) monta o corpo assim:

- pega `data.body` (texto digitado no `Textarea`),
- troca `\n` por `<br/>`,
- envia com `Content-Type: text/html; charset="UTF-8"` mas **sem `<html><body>` envolvendo**, e **sem alternativa em texto**.

Alguns clientes (incluindo Gmail web, dependendo do remetente/threading) tratam esse HTML "fragmento" como inválido e mostram o corpo vazio, truncado ou só o link do Meet. Também não há fallback `text/plain` — quando o HTML falha, não sobra nada para exibir.

## Mudanças

### `src/lib/google/gmail.functions.ts`
1. Construir **duas versões** do corpo:
   - `textVersion`: o `data.body` original (preserva quebras de linha como `\r\n`), + linha extra com o link do Meet se houver.
   - `htmlVersion`: HTML completo (`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5">…</body></html>`) com o texto convertido (escapando `&`, `<`, `>` antes de trocar `\n` por `<br/>`) e o bloco do Meet como `<p><a href="…">…</a></p>`.
2. Trocar o envelope MIME para **`multipart/alternative`** com boundary aleatório:
   - parte 1: `text/plain; charset="UTF-8"` + `Content-Transfer-Encoding: base64` (corpo em base64 quebrado a 76 col).
   - parte 2: `text/html; charset="UTF-8"` + `Content-Transfer-Encoding: base64` (idem).
3. Manter `Subject` codificado em `=?UTF-8?B?…?=` (já está correto).
4. Adicionar header `From: hublynx.dev@gmail.com` explícito (alguns clientes destacam melhor).
5. Manter `toBase64Url` para o `raw` final enviado ao Gmail API.

### Sem alterações em
- `SendEmailDialog.tsx` (UI continua igual — usuário digita texto puro).
- `gmail-test.functions.ts` (já funciona; serve como referência).
- Schema/validação/inserção em `task_communications`.

## Validação

Após o ajuste, reabrir uma tarefa, enviar e-mail com acentos e quebras de linha (e opcionalmente Meet) para um Gmail real e conferir:
- assunto sem "Sobre:" e com acentos corretos,
- corpo visível com parágrafos preservados,
- link do Meet clicável no final.
