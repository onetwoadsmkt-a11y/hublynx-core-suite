// Server-only: envio de e-mail pelo Gmail conectado de um usuário.
import { GOOGLE_API_BASE, googleHeaders } from "./google.functions";

const b64url = (s: string) =>
  Buffer.from(s, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64wrap = (s: string) => Buffer.from(s, "utf-8").toString("base64").replace(/(.{76})/g, "$1\r\n");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Envia texto simples (com versão HTML) pelo Gmail de `userId`. Lança se falhar. */
export async function sendGmail(userId: string, to: string[], subject: string, body: string): Promise<string | null> {
  const boundary = `=_hublynx_${Math.random().toString(36).slice(2)}`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5">${esc(body).replace(/\n/g, "<br/>")}</body></html>`;
  const raw = b64url([
    `To: ${to.join(", ")}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64wrap(body),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64wrap(html),
    `--${boundary}--`,
    "",
  ].join("\r\n"));
  const res = await fetch(`${GOOGLE_API_BASE}/gmail/v1/users/me/messages/send`, {
    method: "POST",
    headers: { ...(await googleHeaders(userId)), "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(`Gmail recusou (${res.status}): ${json?.error?.message ?? "erro desconhecido"}`);
  return json.id ?? null;
}
