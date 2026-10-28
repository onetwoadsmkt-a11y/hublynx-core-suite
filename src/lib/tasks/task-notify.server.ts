// Server-only — avisos por e-mail (e no sino) das tarefas designadas a cada pessoa.
// 1) Tarefa designada: um e-mail por tarefa e pessoa, logo após receber a tarefa.
// 2) Resumo do dia (a partir das 7h de Brasília): tarefas para hoje e atrasadas,
//    um e-mail e um aviso no sino por pessoa por dia.
// Cada envio é "reservado" em task_push_log (único por tarefa + pessoa + tipo), então
// rodar várias vezes (tela aberta, agendamento) não repete e-mail.
import { CORE_ORIGIN } from "@/lib/core-origin";

type Db = { from: (t: string) => any; auth?: any };

const TZ = "America/Sao_Paulo";
const OPEN = ["concluido", "cancelado"];

function dayIn(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function hourIn(date: Date) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(date)) % 24;
}
const brDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }) : "sem prazo";

export function taskPath(t: { id: string; project_id: string | null }) {
  return t.project_id ? `/projetos/${t.project_id}?aba=etapas&tarefa=${t.id}` : `/tarefas?task=${t.id}`;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  project_id: string | null;
  assignee_id: string;
  created_by: string | null;
  owner_id: string | null;
  updated_at: string;
};

async function claim(admin: Db, taskId: string, userId: string, kind: string) {
  const { error } = await admin.from("task_push_log").insert({ task_id: taskId, user_id: userId, kind });
  return !error; // conflito = já enviado
}
async function unclaim(admin: Db, taskId: string, userId: string, kind: string) {
  await admin.from("task_push_log").delete().eq("task_id", taskId).eq("user_id", userId).eq("kind", kind);
}

function mailLayout(orgName: string, firstName: string, intro: string, rows: { title: string; sub: string; href: string; late?: boolean }[], cta: { label: string; href: string }) {
  const items = rows
    .map(
      (r) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eef0f3">
<a href="${esc(r.href)}" style="color:#0f2b4c;font-weight:bold;text-decoration:none;font-size:15px">${esc(r.title)}</a>
<div style="font-size:13px;color:${r.late ? "#b42318" : "#6b7280"};margin-top:2px">${esc(r.sub)}</div></td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0f2b4c;color:#ffffff;padding:18px 28px;font-size:17px;font-weight:bold">${esc(orgName || "Core")}</td></tr>
<tr><td style="padding:24px 28px">
<p style="margin:0 0 12px;font-size:16px">Olá, ${esc(firstName)}!</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
<p style="margin:22px 0 0"><a href="${esc(cta.href)}" style="display:inline-block;background:#0f2b4c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:15px">${esc(cta.label)}</a></p>
<p style="margin:18px 0 0;font-size:12px;color:#6b7280">Você recebe este aviso porque estas tarefas estão sob sua responsabilidade no Core.</p>
</td></tr></table></td></tr></table></body></html>`;
}

async function personOf(admin: Db, userId: string, cache: Map<string, { email: string | null; name: string }>) {
  const hit = cache.get(userId);
  if (hit) return hit;
  let email: string | null = null;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    email = data?.user?.email ?? null;
  } catch {
    /* sem e-mail */
  }
  const { data: prof } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const out = { email, name: ((prof?.full_name as string | undefined) || email || "").trim() };
  cache.set(userId, out);
  return out;
}

export async function runTaskNotifications(
  admin: Db,
  opts: { organizationId?: string; now?: Date; maxMails?: number } = {},
) {
  const now = opts.now ?? new Date();
  const today = dayIn(now);
  const maxMails = opts.maxMails ?? 40;
  let mails = 0;
  let notified = 0;
  const people = new Map<string, { email: string | null; name: string }>();

  let q = admin
    .from("tasks")
    .select("id, title, status, due_date, project_id, assignee_id, created_by, owner_id, updated_at, organization_id")
    .not("assignee_id", "is", null)
    .not("status", "in", `(${OPEN.join(",")})`)
    .limit(2000);
  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const tasks = (data ?? []) as (TaskRow & { organization_id: string })[];
  if (!tasks.length) return { mails, notified };

  const projectIds = [...new Set(tasks.map((t) => t.project_id).filter(Boolean))] as string[];
  const projName = new Map<string, string>();
  if (projectIds.length) {
    const { data: ps } = await admin.from("projects").select("id, name").in("id", projectIds);
    for (const p of (ps ?? []) as any[]) projName.set(p.id, p.name);
  }
  const orgIds = [...new Set(tasks.map((t) => t.organization_id))];
  const orgName = new Map<string, string>();
  {
    const { data: os } = await admin.from("organizations").select("id, name").in("id", orgIds);
    for (const o of (os ?? []) as any[]) orgName.set(o.id, o.name);
  }
  const { sendOrgMail } = await import("@/lib/projects/client-invite.server");
  const label = (t: TaskRow) => (t.project_id ? `${projName.get(t.project_id) ?? "Projeto"}` : "Agenda");

  // 1) Tarefa designada (recém criada/atribuída: alterada nos últimos 3 dias)
  const recent = now.getTime() - 3 * 86_400_000;
  for (const t of tasks) {
    if (mails >= maxMails) break;
    if (new Date(t.updated_at).getTime() < recent) continue;
    if (!(await claim(admin, t.id, t.assignee_id, "mail_assigned"))) continue;
    const who = await personOf(admin, t.assignee_id, people);
    if (!who.email) continue; // reserva fica: sem e-mail não há o que reenviar
    const href = `${CORE_ORIGIN}${taskPath(t)}`;
    const first = who.name.split(/\s+/)[0] || "tudo bem";
    const org = orgName.get(t.organization_id) ?? "";
    const res = await sendOrgMail(admin, {
      organizationId: t.organization_id,
      preferUserIds: [t.created_by, t.owner_id],
      to: who.email,
      toName: who.name,
      build: () => ({
        subject: `Nova tarefa para você: ${t.title}`,
        text: `Olá, ${first}!\n\nVocê recebeu a tarefa "${t.title}" (${label(t)}), prazo ${brDate(t.due_date)}.\n\nAbrir: ${href}`,
        html: mailLayout(org, first, "Você recebeu uma nova tarefa:", [
          { title: t.title, sub: `${label(t)} · prazo ${brDate(t.due_date)}`, href },
        ], { label: "Abrir a tarefa", href }),
      }),
    });
    if (res.sent) mails++;
    else await unclaim(admin, t.id, t.assignee_id, "mail_assigned");
  }

  // 2) Resumo do dia por pessoa: para hoje + atrasadas (a partir das 7h)
  if (hourIn(now) >= 7) {
    const byUser = new Map<string, (TaskRow & { organization_id: string; late: boolean })[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const d = dayIn(new Date(t.due_date));
      if (d > today) continue;
      const late = d < today;
      byUser.set(t.assignee_id, [...(byUser.get(t.assignee_id) ?? []), { ...t, late }]);
    }
    for (const [userId, list] of byUser) {
      if (mails >= maxMails) break;
      list.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
      const kind = `digest_${today}`;
      // reserva no primeiro item da lista (um resumo por pessoa por dia)
      const { data: already } = await admin
        .from("task_push_log").select("id").eq("user_id", userId).eq("kind", kind).limit(1);
      if (already?.length) continue;
      if (!(await claim(admin, list[0].id, userId, kind))) continue;
      const late = list.filter((t) => t.late).length;
      const due = list.length - late;
      const resume = [late ? `${late} atrasada(s)` : "", due ? `${due} para hoje` : ""].filter(Boolean).join(" e ");
      await admin.from("notifications").insert({
        user_id: userId,
        title: late ? "Você tem tarefas atrasadas" : "Tarefas para hoje",
        body: `${resume}. Toque para ver.`,
        link: list.length === 1 ? taskPath(list[0]) : "/minhas-tarefas",
      });
      notified++;
      const who = await personOf(admin, userId, people);
      if (!who.email) continue;
      const first = who.name.split(/\s+/)[0] || "tudo bem";
      const org = list[0].organization_id;
      const listHref = `${CORE_ORIGIN}/minhas-tarefas`;
      const res = await sendOrgMail(admin, {
        organizationId: org,
        preferUserIds: [list[0].created_by, list[0].owner_id],
        to: who.email,
        toName: who.name,
        build: () => ({
          subject: late ? `Você tem ${late} tarefa(s) atrasada(s)` : `Suas tarefas de hoje (${due})`,
          text: `Olá, ${first}!\n\nVocê tem ${resume}:\n\n${list
            .map((t) => `- ${t.title} (${label(t)}) · ${t.late ? "atrasada desde" : "prazo"} ${brDate(t.due_date)}: ${CORE_ORIGIN}${taskPath(t)}`)
            .join("\n")}\n\nVer todas: ${listHref}`,
          html: mailLayout(orgName.get(org) ?? "", first, `Você tem ${resume}:`, list.slice(0, 25).map((t) => ({
            title: t.title,
            sub: `${label(t)} · ${t.late ? "atrasada desde" : "prazo"} ${brDate(t.due_date)}`,
            href: `${CORE_ORIGIN}${taskPath(t)}`,
            late: t.late,
          })), { label: "Ver minhas tarefas", href: listHref }),
        }),
      });
      if (res.sent) mails++;
    }
  }
  return { mails, notified };
}
