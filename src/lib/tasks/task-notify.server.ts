// Server-only — avisos por e-mail (e no sino) das tarefas designadas a cada pessoa.
// 1) Tarefa designada: um e-mail por tarefa e pessoa, logo após receber a tarefa.
// 2) Resumo do dia (a partir das 7h de Brasília): tarefas para hoje e atrasadas,
//    um e-mail e um aviso no sino por pessoa por dia.
// Cada envio é "reservado" em task_push_log (único por tarefa + pessoa + tipo), então
// rodar várias vezes (tela aberta, agendamento) não repete e-mail.
import { CORE_ORIGIN } from "@/lib/core-origin";
import { dayKey, dueDayKey, dueHasTime, isOverdue } from "@/lib/tasks/pending";

type Db = { from: (t: string) => any; auth?: any };

const TZ = "America/Sao_Paulo";
const OPEN = ["concluido", "cancelado"];

function dayIn(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function hourIn(date: Date) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(date)) % 24;
}
// dia certo também para prazos "só com dia" (gravados à meia-noite UTC ou como data pura)
const brDate = (iso: string | null) => {
  const k = iso ? dueDayKey(iso) : null;
  return k ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : "sem prazo";
};

const PRIO: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Urgente" };
/** Prazo com horário quando houver (tarefas só com dia mostram só a data). */
function brDateTime(iso: string | null) {
  if (!iso) return "sem prazo";
  if (!dueHasTime(iso)) return brDate(iso);
  const hm = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return `${brDate(iso)} às ${hm}`;
}

export function taskPath(t: { id: string; project_id: string | null }) {
  return t.project_id ? `/projetos/${t.project_id}?aba=etapas&tarefa=${t.id}` : `/tarefas?task=${t.id}`;
}

export function esc(s: string) {
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

/** Identidade visual da empresa no e-mail (Configurações › Aparência). */
export type MailBrand = { logoUrl?: string | null; color?: string | null };

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Texto preto ou branco sobre a cor da marca, conforme o contraste. */
function textOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#000000" : "#FFFFFF";
}

/** Busca logo e cor da marca das empresas (uma consulta, com cache no Map). */
export async function brandsOf(admin: Db, orgIds: string[], cache = new Map<string, { name: string; brand: MailBrand }>()) {
  const missing = orgIds.filter((id) => id && !cache.has(id));
  if (missing.length) {
    const { data } = await admin.from("organizations").select("id, name, logo_url, brand_color").in("id", missing);
    for (const o of (data ?? []) as any[])
      cache.set(o.id, { name: o.name ?? "", brand: { logoUrl: o.logo_url ?? null, color: o.brand_color ?? null } });
  }
  return cache;
}

export type MailRow = { title: string; sub: string; href: string; late?: boolean; details?: [string, string][] };

/**
 * Modelo de e-mail com a identidade da empresa: faixa e botão na cor da marca, logo no topo
 * (ou o nome da empresa), cards das tarefas/avisos com borda na cor da marca.
 */
export function mailLayout(
  orgName: string,
  firstName: string,
  intro: string,
  rows: MailRow[],
  cta: { label: string; href: string },
  footer = "Você recebe este aviso porque estas tarefas estão sob sua responsabilidade no Core.",
  brand: MailBrand = {},
) {
  const color = brand.color && HEX.test(brand.color) ? brand.color : "#00D084";
  const onColor = textOn(color);
  const head = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(orgName || "Logo")}" height="44" style="display:block;max-height:44px;max-width:180px;height:auto;width:auto;border:0">`
    : `<span style="font-size:20px;font-weight:800;color:#0b1220;letter-spacing:.2px">${esc(orgName || "Core Suite")}</span>`;
  const items = rows
    .map((r) => {
      const det = (r.details ?? [])
        .map(
          ([k, v]) => `<tr><td style="padding:3px 12px 3px 0;font-size:12px;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(k)}</td>
<td style="padding:3px 0;font-size:13px;color:#111827;font-weight:600">${esc(v)}</td></tr>`,
        )
        .join("");
      return `<tr><td style="padding:0 0 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${r.late ? "#f3b4b4" : "#e5e7eb"};border-left:5px solid ${r.late ? "#D7262F" : color};border-radius:10px;background:${r.late ? "#fff5f5" : "#ffffff"}">
<tr><td style="padding:12px 14px">
${r.late ? `<div style="font-size:11px;font-weight:800;color:#D7262F;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Atrasada</div>` : ""}
<a href="${esc(r.href)}" style="color:#0b1220;font-weight:800;text-decoration:none;font-size:15px;line-height:1.35">${esc(r.title)}</a>
<div style="font-size:13px;color:${r.late ? "#b42318" : "#4b5563"};margin-top:3px">${esc(r.sub)}</div>
${det ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px">${det}</table>` : ""}
</td></tr></table></td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="height:6px;background:${color};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:20px 28px 16px;border-bottom:1px solid #f0f1f3">${head}</td></tr>
<tr><td style="padding:24px 28px 8px">
<p style="margin:0 0 10px;font-size:17px;font-weight:700;color:#0b1220">Olá, ${esc(firstName)}!</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#374151">${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 6px"><tr><td style="border-radius:10px;background:${color}">
<a href="${esc(cta.href)}" style="display:inline-block;padding:13px 24px;font-weight:800;font-size:15px;color:${onColor};text-decoration:none;border-radius:10px">${esc(cta.label)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:16px 28px 22px;font-size:12px;line-height:1.5;color:#6b7280;border-top:1px solid #f0f1f3;margin-top:12px">${esc(footer)}<br>${esc(orgName || "")}${orgName ? " · " : ""}enviado pelo Core Suite</td></tr>
</table></td></tr></table></body></html>`;
}

export async function personOf(admin: Db, userId: string, cache: Map<string, { email: string | null; name: string }>) {
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
    .select("id, title, status, due_date, project_id, assignee_id, created_by, owner_id, updated_at, organization_id, priority, description, responsible_type")
    .not("assignee_id", "is", null)
    .not("status", "in", `(${OPEN.join(",")})`)
    .limit(2000);
  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  // tarefas do cliente: o aviso vai pelo portal (sino + e-mail com o link do portal, migração 35)
  const tasks = ((data ?? []) as (TaskRow & { organization_id: string; responsible_type?: string | null })[]).filter(
    (t) => t.responsible_type !== "cliente",
  );
  if (!tasks.length) {
    const a = await runAdminOverdueAlerts(admin, { organizationId: opts.organizationId, now, maxMails });
    return { mails: mails + a.mails, notified: notified + a.notified };
  }

  const projectIds = [...new Set(tasks.map((t) => t.project_id).filter(Boolean))] as string[];
  const projName = new Map<string, string>();
  if (projectIds.length) {
    const { data: ps } = await admin.from("projects").select("id, name").in("id", projectIds);
    for (const p of (ps ?? []) as any[]) projName.set(p.id, p.name);
  }
  const orgIds = [...new Set(tasks.map((t) => t.organization_id))];
  const brands = await brandsOf(admin, orgIds);
  const orgName = new Map<string, string>([...brands].map(([id, b]) => [id, b.name]));
  const { sendOrgMail } = await import("@/lib/projects/client-invite.server");
  const label = (t: TaskRow) => (t.project_id ? `${projName.get(t.project_id) ?? "Projeto"}` : "Agenda");

  // 1) Tarefa designada (recém criada/atribuída: alterada nos últimos 3 dias).
  // Várias tarefas da mesma pessoa no mesmo projeto (ex.: modelo aplicado) viram UM e-mail com a lista.
  const recent = now.getTime() - 3 * 86_400_000;
  const groups = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (new Date(t.updated_at).getTime() < recent) continue;
    if (!(await claim(admin, t.id, t.assignee_id, "mail_assigned"))) continue;
    const key = `${t.assignee_id}|${t.project_id ?? `t:${t.id}`}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  for (const list of groups.values()) {
    const t = list[0];
    const release = async () => { for (const x of list) await unclaim(admin, x.id, x.assignee_id, "mail_assigned"); };
    if (mails >= maxMails) { await release(); continue; } // fica para a próxima rodada
    const who = await personOf(admin, t.assignee_id, people);
    if (!who.email) continue; // reserva fica: sem e-mail não há o que reenviar
    const first = who.name.split(/\s+/)[0] || "tudo bem";
    const org = orgName.get(t.organization_id) ?? "";
    const by = t.created_by && t.created_by !== t.assignee_id ? (await personOf(admin, t.created_by, people)).name : null;
    const items = list
      .slice()
      .sort((x, y) => String(x.due_date ?? "9").localeCompare(String(y.due_date ?? "9")))
      .map((x) => {
        const when = brDateTime(x.due_date);
        const prio = PRIO[(x as any).priority as string] ?? null;
        const desc = ((x as any).description as string | null)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const details: [string, string][] = [
          ["Onde", label(x)],
          ["Prazo", when],
          ...(prio ? [["Prioridade", prio] as [string, string]] : []),
          ...(by && list.length === 1 ? [["Enviada por", by] as [string, string]] : []),
        ];
        return { title: x.title, sub: desc ? desc.slice(0, 180) : `${label(x)} · prazo ${when}`, href: `${CORE_ORIGIN}${taskPath(x)}`, details };
      });
    const many = list.length > 1;
    const href = many && t.project_id ? `${CORE_ORIGIN}/projetos/${t.project_id}?aba=etapas` : items[0].href;
    const res = await sendOrgMail(admin, {
      organizationId: t.organization_id,
      preferUserIds: [t.created_by, t.owner_id],
      to: who.email,
      toName: who.name,
      build: () => ({
        subject: many ? `${list.length} novas tarefas para você: ${label(t)}` : `Nova tarefa para você: ${t.title}`,
        text: many
          ? `Olá, ${first}!\n\nVocê recebeu ${list.length} tarefas (${label(t)}):\n${items.map((i) => `- ${i.title} (prazo ${i.details[1][1]})`).join("\n")}\n\nAbrir: ${href}`
          : `Olá, ${first}!\n\nVocê recebeu a tarefa "${t.title}" (${label(t)}), prazo ${brDateTime(t.due_date)}${by ? `, enviada por ${by}` : ""}.\n\nAbrir: ${href}`,
        html: mailLayout(
          org,
          first,
          many
            ? `${by ? `${by.split(" ")[0]} incluiu você no projeto. ` : ""}Estas ${list.length} tarefas são suas:`
            : by ? `${by.split(" ")[0]} agendou uma tarefa para você:` : "Uma tarefa foi agendada para você:",
          items.slice(0, 40),
          { label: many ? "Abrir as tarefas no projeto" : "Abrir a tarefa", href },
          "Você recebe este aviso porque estas tarefas foram designadas a você no Core.",
          brands.get(t.organization_id)?.brand,
        ),
      }),
    });
    if (res.sent) mails++;
    else await release();
  }

  // 2) Resumo do dia por pessoa: para hoje + atrasadas (a partir das 7h)
  if (hourIn(now) >= 7) {
    const byUser = new Map<string, (TaskRow & { organization_id: string; late: boolean })[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const d = dueDayKey(t.due_date);
      if (!d || d > today) continue;
      // mesma regra do destaque vermelho: com hora vence na hora; só com dia, no dia seguinte
      const late = isOverdue({ due_date: t.due_date, status: t.status }, now);
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
          })), { label: "Ver minhas tarefas", href: listHref }, undefined, brands.get(org)?.brand),
        }),
      });
      if (res.sent) mails++;
    }
  }
  // 3) Administradores da empresa: tarefas de projetos ativos que entraram em atraso
  const a = await runAdminOverdueAlerts(admin, { organizationId: opts.organizationId, now, maxMails: Math.max(0, maxMails - mails) });
  return { mails: mails + a.mails, notified: notified + a.notified };
}

/** Título do aviso no sino dos administradores (a migração 38 evita o e-mail genérico repetido). */
export const ADMIN_LATE_TITLE = "Tarefas atrasadas nos projetos";
const INACTIVE_PROJECT = ["concluido", "cancelado", "em_pausa", "pausado"];

/**
 * Avisa os administradores da empresa (org_admin) quando uma tarefa de projeto ativo entra
 * em atraso — sino (um aviso por projeto) e um e-mail por administrador com a lista.
 * Cada tarefa avisa cada administrador uma vez (task_push_log, tipo "admin_late").
 * Vale para tarefas da equipe, do cliente e sem responsável. Só entre 7h e 21h (Brasília):
 * fora desse horário fica para a próxima rodada.
 */
export async function runAdminOverdueAlerts(
  admin: Db,
  opts: { organizationId?: string; now?: Date; maxMails?: number } = {},
) {
  const now = opts.now ?? new Date();
  const maxMails = opts.maxMails ?? 40;
  let mails = 0;
  let notified = 0;
  const h = hourIn(now);
  if (h < 7 || h >= 21) return { mails, notified };

  let q = admin
    .from("tasks")
    .select("id, title, status, due_date, project_id, assignee_id, created_by, owner_id, updated_at, organization_id, responsible_type")
    .not("project_id", "is", null)
    .not("due_date", "is", null)
    .not("status", "in", `(${OPEN.join(",")})`)
    .lte("due_date", now.toISOString())
    .order("due_date", { ascending: true })
    .limit(2000);
  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  type Late = TaskRow & { organization_id: string; responsible_type?: string | null };
  let late = ((data ?? []) as Late[]).filter((t) => t.organization_id && isOverdue({ due_date: t.due_date, status: t.status }, now));
  if (!late.length) return { mails, notified };

  // só projetos ativos
  const projectIds = [...new Set(late.map((t) => t.project_id!))];
  const projects = new Map<string, { name: string; number: number | null }>();
  for (let i = 0; i < projectIds.length; i += 200) {
    const { data: ps } = await admin
      .from("projects")
      .select("id, name, status, project_number")
      .in("id", projectIds.slice(i, i + 200));
    for (const p of (ps ?? []) as any[]) {
      if (!INACTIVE_PROJECT.includes(String(p.status ?? ""))) projects.set(p.id, { name: p.name, number: p.project_number ?? null });
    }
  }
  late = late.filter((t) => projects.has(t.project_id!));
  if (!late.length) return { mails, notified };

  // administradores de cada empresa
  const orgIds = [...new Set(late.map((t) => t.organization_id))];
  const { data: adm } = await admin
    .from("organization_members")
    .select("organization_id, user_id")
    .in("organization_id", orgIds)
    .eq("status", "active")
    .in("role", ["org_admin", "owner", "admin"]);
  const adminsOf = new Map<string, string[]>();
  for (const r of (adm ?? []) as any[]) if (r.user_id) adminsOf.set(r.organization_id, [...(adminsOf.get(r.organization_id) ?? []), r.user_id]);

  const people = new Map<string, { email: string | null; name: string }>();
  const brands = await brandsOf(admin, orgIds);
  const { sendOrgMail } = await import("@/lib/projects/client-invite.server");
  const projLabel = (id: string) => {
    const p = projects.get(id)!;
    return `${p.number ? `Nº ${p.number} · ` : ""}${p.name}`;
  };
  const who = async (id: string | null | undefined) => (id ? (await personOf(admin, id, people)).name || null : null);

  for (const orgId of orgIds) {
    const admins = adminsOf.get(orgId) ?? [];
    const orgLate = late.filter((t) => t.organization_id === orgId);
    for (const adminId of admins) {
      // sem cota de e-mail agora: nada é reservado, fica tudo para a próxima rodada
      if (mails >= maxMails) break;
      // reserva cada tarefa para este administrador (avisa uma vez por tarefa)
      const fresh: Late[] = [];
      for (const t of orgLate) if (await claim(admin, t.id, adminId, "admin_late")) fresh.push(t);
      if (!fresh.length) continue;

      // sino: um aviso por projeto
      const byProject = new Map<string, Late[]>();
      for (const t of fresh) byProject.set(t.project_id!, [...(byProject.get(t.project_id!) ?? []), t]);
      for (const [pid, list] of byProject) {
        const names = list.slice(0, 3).map((t) => `"${t.title}"`).join(", ");
        await admin.from("notifications").insert({
          user_id: adminId,
          title: ADMIN_LATE_TITLE,
          body: `${projLabel(pid)}: ${list.length} tarefa(s) em atraso — ${names}${list.length > 3 ? "…" : ""}`.slice(0, 280),
          link: list.length === 1 ? taskPath(list[0]) : `/projetos/${pid}?aba=etapas`,
        });
        notified++;
      }

      // e-mail: um por administrador, com todas as tarefas que entraram em atraso
      const person = await personOf(admin, adminId, people);
      if (!person.email) continue;
      const first = person.name.split(/\s+/)[0] || "tudo bem";
      const items: { title: string; sub: string; href: string; late: boolean; details: [string, string][] }[] = [];
      for (const t of fresh.slice(0, 40)) {
        const resp = t.responsible_type === "cliente" ? "Cliente (portal)" : (await who(t.assignee_id)) ?? "Sem responsável";
        const days = (() => {
          const k = dueDayKey(t.due_date)!;
          const td = dayKey(now);
          const n = Math.round((Date.UTC(+td.slice(0, 4), +td.slice(5, 7) - 1, +td.slice(8, 10)) - Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10))) / 86_400_000);
          return n <= 0 ? "atrasada desde hoje" : `atrasada há ${n} dia${n > 1 ? "s" : ""}`;
        })();
        items.push({
          title: t.title,
          sub: `${projLabel(t.project_id!)} · ${days}`,
          href: `${CORE_ORIGIN}${taskPath(t)}`,
          late: true,
          details: [
            ["Projeto", projLabel(t.project_id!)],
            ["Prazo", brDateTime(t.due_date)],
            ["Responsável", resp],
          ] as [string, string][],
        });
      }
      const nProj = byProject.size;
      const href = nProj === 1 ? `${CORE_ORIGIN}/projetos/${fresh[0].project_id}?aba=etapas` : `${CORE_ORIGIN}/projetos`;
      const res = await sendOrgMail(admin, {
        organizationId: orgId,
        preferUserIds: [adminId],
        to: person.email,
        toName: person.name,
        build: () => ({
          subject: fresh.length === 1
            ? `Tarefa em atraso: ${fresh[0].title} (${projLabel(fresh[0].project_id!)})`
            : `${fresh.length} tarefas em atraso${nProj === 1 ? ` em ${projLabel(fresh[0].project_id!)}` : ` em ${nProj} projetos`}`,
          text: `Olá, ${first}!\n\nEstas tarefas de projetos ativos entraram em atraso:\n\n${items
            .map((i) => `- ${i.title} — ${i.sub} · responsável: ${i.details[2][1]}: ${i.href}`)
            .join("\n")}\n\nAbrir: ${href}`,
          html: mailLayout(
            brands.get(orgId)?.name ?? "",
            first,
            fresh.length === 1 ? "Uma tarefa de projeto entrou em atraso:" : `${fresh.length} tarefas de projetos entraram em atraso:`,
            items,
            { label: nProj === 1 ? "Abrir o projeto" : "Abrir os projetos", href },
            "Você recebe este aviso porque é administrador da empresa no Core. Cada tarefa é avisada uma vez, quando entra em atraso.",
            brands.get(orgId)?.brand,
          ),
        }),
      });
      if (res.sent) mails++;
    }
  }
  return { mails, notified };
}

