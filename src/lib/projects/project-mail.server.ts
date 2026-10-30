// Server-only — e-mails agrupados das movimentações e mensagens dos projetos.
// Os avisos entram em project_mail_queue pelos gatilhos do banco (migração 30).
// Aqui mandamos UM e-mail por pessoa com tudo o que está pendente, quando:
//   • há mensagem pendente há 5 min ou mais; ou
//   • o aviso mais antigo está pendente há 15 min ou mais.
// Assim um dia movimentado vira poucos e-mails, e o sino continua avisando na hora.
import { CORE_ORIGIN } from "@/lib/core-origin";
import { mailLayout, personOf } from "@/lib/tasks/task-notify.server";

type Db = { from: (t: string) => any; auth?: any };

type QueueRow = {
  id: string;
  organization_id: string | null;
  project_id: string | null;
  user_id: string;
  audience: "equipe" | "cliente";
  kind: string;
  is_message: boolean;
  title: string;
  body: string | null;
  link: string | null;
  actor_id: string | null;
  created_at: string;
  attempts: number;
};

const MESSAGE_WAIT_MS = 5 * 60_000;
const ACTIVITY_WAIT_MS = 15 * 60_000;
const GIVE_UP_AFTER = 5;

/** Quais pessoas já devem receber o resumo (função pura, testada). */
export function dueRecipients(rows: Pick<QueueRow, "user_id" | "is_message" | "created_at">[], now: Date) {
  const by = new Map<string, { oldest: number; oldestMsg: number | null }>();
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    const cur = by.get(r.user_id) ?? { oldest: t, oldestMsg: null };
    cur.oldest = Math.min(cur.oldest, t);
    if (r.is_message) cur.oldestMsg = cur.oldestMsg === null ? t : Math.min(cur.oldestMsg, t);
    by.set(r.user_id, cur);
  }
  const n = now.getTime();
  return [...by.entries()]
    .filter(([, v]) => n - v.oldest >= ACTIVITY_WAIT_MS || (v.oldestMsg !== null && n - v.oldestMsg >= MESSAGE_WAIT_MS))
    .map(([u]) => u);
}

export async function runProjectMail(admin: Db, opts: { organizationId?: string; now?: Date; maxMails?: number } = {}) {
  const now = opts.now ?? new Date();
  const maxMails = opts.maxMails ?? 40;
  let q = admin
    .from("project_mail_queue")
    .select("id, organization_id, project_id, user_id, audience, kind, is_message, title, body, link, actor_id, created_at, attempts")
    .is("sent_at", null)
    .order("created_at")
    .limit(2000);
  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  const { data, error } = await q;
  if (error) {
    // antes da migração 30 a fila não existe
    if (/project_mail_queue/.test(error.message)) return { mails: 0, pending: 0 };
    throw new Error(error.message);
  }
  const rows = (data ?? []) as QueueRow[];
  if (!rows.length) return { mails: 0, pending: 0 };

  const ready = dueRecipients(rows, now);
  const { sendOrgMail } = await import("@/lib/projects/client-invite.server");
  const people = new Map<string, { email: string | null; name: string }>();
  const orgNames = new Map<string, string>();
  let mails = 0;

  for (const userId of ready) {
    if (mails >= maxMails) break;
    const list = rows.filter((r) => r.user_id === userId);
    const ids = list.map((r) => r.id);
    const org = list.find((r) => r.organization_id)?.organization_id ?? null;
    const who = await personOf(admin, userId, people);
    if (!who.email || !org) {
      // sem e-mail ou sem empresa: não há para quem mandar — tira da fila
      await admin.from("project_mail_queue").update({ sent_at: now.toISOString() }).in("id", ids);
      continue;
    }
    if (!orgNames.has(org)) {
      const { data: o } = await admin.from("organizations").select("name").eq("id", org).maybeSingle();
      orgNames.set(org, (o?.name as string | undefined) ?? "");
    }
    const first = who.name.split(/\s+/)[0] || "tudo bem";
    const msgs = list.filter((r) => r.is_message).length;
    const acts = list.length - msgs;
    const resume = [msgs ? `${msgs} mensage${msgs === 1 ? "m" : "ns"}` : "", acts ? `${acts} movimentaç${acts === 1 ? "ão" : "ões"}` : ""]
      .filter(Boolean)
      .join(" e ");
    const isClient = list.every((r) => r.audience === "cliente");
    const projectIds = [...new Set(list.map((r) => r.project_id).filter(Boolean))];
    const ctaHref = `${CORE_ORIGIN}${list[list.length - 1].link ?? (projectIds.length === 1 ? `/projetos/${projectIds[0]}` : "/projetos")}`;
    const shown = [...list].reverse().slice(0, 30);
    const res = await sendOrgMail(admin, {
      organizationId: org,
      preferUserIds: list.map((r) => r.actor_id),
      to: who.email,
      toName: who.name,
      build: () => ({
        subject: msgs && !acts
          ? `${msgs === 1 ? "Nova mensagem" : `${msgs} novas mensagens`} no projeto`
          : `Novidades no projeto: ${resume}`,
        text: `Olá, ${first}!\n\nVocê tem ${resume}:\n\n${shown
          .map((r) => `- ${r.title}: ${r.body ?? ""}${r.link ? ` (${CORE_ORIGIN}${r.link})` : ""}`)
          .join("\n")}\n\nAbrir: ${ctaHref}`,
        html: mailLayout(
          orgNames.get(org) ?? "",
          first,
          `Você tem ${resume}:`,
          shown.map((r) => ({
            title: r.title,
            sub: `${r.body ?? ""} · ${new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`,
            href: `${CORE_ORIGIN}${r.link ?? "/projetos"}`,
          })),
          { label: isClient ? "Abrir o portal do projeto" : "Abrir no Core", href: ctaHref },
          isClient
            ? "Você recebe este aviso porque acompanha este projeto pelo portal do cliente."
            : "Você recebe este aviso porque participa deste projeto no Core.",
        ),
      }),
    });
    if (res.sent) {
      mails++;
      await admin.from("project_mail_queue").update({ sent_at: now.toISOString() }).in("id", ids);
    } else {
      // caixa de e-mail não conectada ou falha: tenta de novo nas próximas rodadas
      const attempts = Math.max(...list.map((r) => r.attempts)) + 1;
      await admin
        .from("project_mail_queue")
        .update(attempts >= GIVE_UP_AFTER ? { attempts, sent_at: now.toISOString() } : { attempts })
        .in("id", ids);
    }
  }
  return { mails, pending: rows.length };
}
