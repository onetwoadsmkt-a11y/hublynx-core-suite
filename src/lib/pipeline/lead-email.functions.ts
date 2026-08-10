import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GOOGLE_GATEWAY_URL, getGoogleGatewayHeaders } from "@/lib/google/google.functions";

const schema = z.object({
  leadId: z.string().uuid(),
  to: z.array(z.string().email()).min(1).max(20),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50000),
});

function toBase64Url(s: string) {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64Wrapped(s: string) {
  return Buffer.from(s, "utf-8").toString("base64").replace(/(.{76})/g, "$1\r\n");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const sendLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: lead, error: lerr } = await supabase
      .from("leads")
      .select("id, owner_id, name")
      .eq("id", data.leadId)
      .maybeSingle();
    if (lerr || !lead) throw new Error("Lead não encontrado");

    const boundary = `=_hublynx_${Math.random().toString(36).slice(2)}`;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5">${escapeHtml(
      data.body,
    ).replace(/\n/g, "<br/>")}</body></html>`;

    const raw = toBase64Url(
      [
        "From: hublynx.dev@gmail.com",
        `To: ${data.to.join(", ")}`,
        `Subject: =?UTF-8?B?${Buffer.from(data.subject, "utf-8").toString("base64")}?=`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        b64Wrapped(data.body),
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        b64Wrapped(html),
        `--${boundary}--`,
        "",
      ].join("\r\n"),
    );

    const res = await fetch(
      `${GOOGLE_GATEWAY_URL}/google_mail/gmail/v1/users/me/messages/send`,
      {
        method: "POST",
        headers: { ...getGoogleGatewayHeaders("mail"), "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(
        `Falha ao enviar e-mail (${res.status}): ${json?.error?.message ?? "erro desconhecido"}`,
      );
    }

    await supabase.from("lead_events").insert({
      lead_id: data.leadId,
      owner_id: lead.owner_id,
      actor_id: userId,
      kind: "email_sent",
      title: `E-mail enviado: ${data.subject}`,
      description: data.body.slice(0, 300),
      meta: { to: data.to, message_id: json?.id ?? null },
    });

    return { ok: true as const, messageId: json?.id ?? null };
  });
