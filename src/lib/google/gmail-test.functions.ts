import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GOOGLE_API_BASE, googleHeaders } from "./google.functions";

const schema = z.object({
  to: z.string().email(),
});

function toBase64Url(s: string) {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const TEST_HTML = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden">
      <tr>
        <td style="padding:24px 28px;background:linear-gradient(135deg,#00D084,#00b873);color:#ffffff">
          <h1 style="margin:0;font-size:20px;letter-spacing:-0.01em">Hublynx — Teste de UTF-8</h1>
          <p style="margin:6px 0 0;opacity:.9;font-size:13px">Validação de codificação no Gmail</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px">
          <p style="margin:0 0 12px">Olá! Este é um e-mail de teste para verificar a <strong>codificação UTF-8</strong> em HTML.</p>
          <p style="margin:0 0 12px"><strong>Acentuação:</strong> ção, são, não, à, é, ê, í, ó, ô, ú, ü, ñ.</p>
          <p style="margin:0 0 12px"><strong>Símbolos:</strong> € £ ¥ © ® ™ § ¶ • – — “aspas” ‘simples’.</p>
          <p style="margin:0 0 12px"><strong>Emoji:</strong> 🚀 ✅ 📨 🇧🇷 — devem aparecer corretamente.</p>
          <p style="margin:0 0 12px"><strong>CJK / Cirílico / Árabe / Hebraico:</strong> 你好 こんにちは Привет مرحبا שלום.</p>
          <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #00D084;background:#f0fdf4;color:#065f46;border-radius:6px">
            Se você consegue ler tudo acima sem caracteres estranhos (Ã©, Ã£, ?), a codificação está correta.
          </blockquote>
          <p style="margin:16px 0 0;font-size:12px;color:#64748b">Enviado por Hublynx Core • teste automatizado.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const subject = "Hublynx — Teste de codificação UTF-8 ✅";
    const encSubject = `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
    const encodedBody = Buffer.from(TEST_HTML, "utf-8")
      .toString("base64")
      .replace(/(.{76})/g, "$1\r\n");

    const rfc = [
      `To: ${data.to}`,
      `Subject: ${encSubject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      encodedBody,
    ].join("\r\n");

    const raw = toBase64Url(rfc);

    const headers = await googleHeaders(userId);
    const res = await fetch(
      `${GOOGLE_API_BASE}/gmail/v1/users/me/messages/send`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        `Falha ao enviar (${res.status}): ${json?.error?.message || JSON.stringify(json)}`,
      );
    }
    return { ok: true as const, messageId: json?.id ?? null, to: data.to };
  });
