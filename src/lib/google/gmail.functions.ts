import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GOOGLE_GATEWAY_URL, getGoogleGatewayHeaders } from "./google.functions";

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

function buildRfc2822({
  to,
  cc,
  subject,
  body,
}: {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
}) {
  const encSubject = `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
  const lines = [
    `To: ${to.join(", ")}`,
    cc && cc.length ? `Cc: ${cc.join(", ")}` : null,
    `Subject: ${encSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    body,
  ].filter(Boolean);
  return lines.join("\r\n");
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

    let html = data.body.replace(/\n/g, "<br/>");
    if (data.meetLink) {
      html += `<br/><br/><p>Link da reunião Google Meet:<br/><a href="${data.meetLink}">${data.meetLink}</a></p>`;
    }

    const raw = toBase64Url(
      buildRfc2822({ to: data.to, cc: data.cc, subject: data.subject, body: html }),
    );

    const headers = getGoogleGatewayHeaders("mail");
    const res = await fetch(
      `${GOOGLE_GATEWAY_URL}/google_mail/gmail/v1/users/me/messages/send`,
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
