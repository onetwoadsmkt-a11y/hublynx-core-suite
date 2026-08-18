import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GOOGLE_API_BASE, googleHeaders } from "./google.functions";

const sendEmailSchema = z.object({
  taskId: z.string().uuid(),
  to: z.array(z.string().email()).min(1).max(20),
  cc: z.array(z.string().email()).max(20).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50000),
  meetLink: z.string().url().optional(),
});

function toBase64Url(s: string) {
  const b64 = Buffer.from(s, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64Wrapped(s: string) {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildRfc2822({
  from,
  to,
  cc,
  subject,
  text,
  html,
}: {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
}) {
  const encSubject = `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
  const boundary = `=_hublynx_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

  const headers = [
    `From: ${from}`,
    `To: ${to.join(", ")}`,
    cc && cc.length ? `Cc: ${cc.join(", ")}` : null,
    `Subject: ${encSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Wrapped(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Wrapped(html),
    `--${boundary}--`,
    "",
  ];

  return [...headers, "", ...parts].join("\r\n");
}

export const sendTaskEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sendEmailSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .select("id, owner_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (taskErr || !task) throw new Error("Tarefa não encontrada");

    const textBody =
      data.body + (data.meetLink ? `\n\nLink da reunião Google Meet:\n${data.meetLink}` : "");

    const htmlInner = escapeHtml(data.body).replace(/\n/g, "<br/>");
    const meetHtml = data.meetLink
      ? `<p style="margin:16px 0 0">Link da reunião Google Meet:<br/><a href="${data.meetLink}">${escapeHtml(data.meetLink)}</a></p>`
      : "";
    const htmlBody = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5"><div style="white-space:normal">${htmlInner}</div>${meetHtml}</body></html>`;

    const raw = toBase64Url(
      buildRfc2822({
        from: "hublynx.dev@gmail.com",
        to: data.to,
        cc: data.cc,
        subject: data.subject,
        text: textBody,
        html: htmlBody,
      }),
    );

    const headers = await googleHeaders(userId);
    const res = await fetch(
      `${GOOGLE_API_BASE}/gmail/v1/users/me/messages/send`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      },
    );
    const json = await res.json().catch(() => ({}) as any);
    if (!res.ok) {
      throw new Error(
        `Falha ao enviar e-mail (${res.status}): ${json?.error?.message || JSON.stringify(json)}`,
      );
    }

    const snippet = data.body.slice(0, 280);
    const recipients = [...data.to, ...(data.cc ?? [])];

    const { error: insErr } = await supabase.from("task_communications").insert({
      task_id: data.taskId,
      owner_id: task.owner_id,
      actor_id: userId,
      kind: "email",
      subject: data.subject,
      recipients,
      body_snippet: snippet,
      provider_id: json?.id ?? null,
      meet_link: data.meetLink ?? null,
      metadata: { thread_id: json?.threadId ?? null },
    });
    if (insErr) throw new Error(insErr.message);

    return { ok: true as const, messageId: json?.id ?? null };
  });
