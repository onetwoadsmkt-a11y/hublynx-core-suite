// @ts-ignore -- tipos do bun test não estão no tsconfig (mock de módulo só existe no bun)
import { describe, it, mock } from "bun:test";
import assert from "node:assert/strict";

// e-mails enviados (sendOrgMail simulado)
const sent: { to: string; subject: string; text: string }[] = [];
mock.module("@/lib/projects/client-invite.server", () => ({
  sendOrgMail: async (_a: unknown, m: any) => {
    const b = m.build("Hublynx", "Valesafe Expansão");
    sent.push({ to: m.to, subject: b.subject, text: b.text });
    return { sent: true, from: "core@exemplo.com" };
  },
}));
const { runAdminOverdueAlerts, ADMIN_LATE_TITLE } = await import("./task-notify.server");

const ORG = "o1";
const tables: Record<string, any[]> = {
  tasks: [
    { id: "t1", title: "Comprar EPIs", status: "a_fazer", due_date: "2026-11-03T00:00:00.000Z", project_id: "p1", assignee_id: "u2", organization_id: ORG, responsible_type: "equipe" },
    { id: "t2", title: "Enviar documentos", status: "a_fazer", due_date: "2026-11-05T13:00:00.000Z", project_id: "p1", assignee_id: null, organization_id: ORG, responsible_type: "cliente" },
    { id: "t3", title: "No prazo (hoje, só dia)", status: "a_fazer", due_date: "2026-11-05T00:00:00.000Z", project_id: "p1", assignee_id: "u2", organization_id: ORG },
    { id: "t4", title: "Concluída", status: "concluido", due_date: "2026-11-01T00:00:00.000Z", project_id: "p1", assignee_id: "u2", organization_id: ORG },
    { id: "t5", title: "Projeto pausado", status: "a_fazer", due_date: "2026-11-01T00:00:00.000Z", project_id: "p2", assignee_id: "u2", organization_id: ORG },
  ],
  projects: [
    { id: "p1", name: "Valesafe Expansão", status: "ativo", project_number: 12 },
    { id: "p2", name: "Antigo", status: "em_pausa", project_number: 3 },
  ],
  organization_members: [
    { organization_id: ORG, user_id: "admin1", role: "org_admin", status: "active" },
    { organization_id: ORG, user_id: "u2", role: "user", status: "active" },
  ],
  organizations: [{ id: ORG, name: "Valesafe Expansão", brand_color: "#f5c400", logo_url: null }],
  profiles: [{ id: "admin1", full_name: "Gilmar Admin" }, { id: "u2", full_name: "Ana Souza" }],
  task_push_log: [],
  notifications: [],
};

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  let single = false;
  let op: "select" | "insert" = "select";
  let insertErr: any = null;
  const b: any = {
    select: () => b,
    order: () => b,
    limit: () => b,
    eq: (k: string, v: any) => { rows = rows.filter((r) => r[k] === v); return b; },
    in: (k: string, v: any[]) => { rows = rows.filter((r) => v.includes(r[k])); return b; },
    lte: (k: string, v: any) => { rows = rows.filter((r) => r[k] != null && r[k] <= v); return b; },
    not: (k: string, o: string, v: any) => {
      if (o === "is") rows = rows.filter((r) => r[k] != null);
      else rows = rows.filter((r) => !String(v).replace(/[()]/g, "").split(",").includes(r[k]));
      return b;
    },
    maybeSingle: () => { single = true; return b; },
    insert: (v: any) => {
      op = "insert";
      if (table === "task_push_log" && tables.task_push_log.some((x) => x.task_id === v.task_id && x.user_id === v.user_id && x.kind === v.kind)) insertErr = { message: "duplicate" };
      else tables[table].push(v);
      return b;
    },
    delete: () => b,
    then: (res: any) => res(op === "insert" ? { error: insertErr } : { data: single ? rows[0] ?? null : rows, error: null }),
  };
  return b;
}
const admin: any = {
  from: builder,
  auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@exemplo.com` } } }) } },
};

describe("aviso de tarefa atrasada para o administrador", () => {
  it("avisa o admin no sino e por e-mail, uma vez por tarefa, só projeto ativo", async () => {
    const now = new Date("2026-11-05T14:30:00-03:00");
    const r1 = await runAdminOverdueAlerts(admin, { now });
    const bells = tables.notifications.filter((n) => n.title === ADMIN_LATE_TITLE);
    console.log("  · sino:", bells.map((b) => `${b.user_id}: ${b.body} → ${b.link}`));
    console.log("  · e-mail:", sent.map((m) => `${m.to} | ${m.subject}`));
    console.log("  · texto:\n" + sent[0]?.text.split("\n").map((l) => "      " + l).join("\n"));
    assert.equal(r1.notified, 1);
    assert.equal(r1.mails, 1);
    assert.equal(bells[0].user_id, "admin1");
    assert.match(sent[0].text, /Comprar EPIs/);
    assert.match(sent[0].text, /Enviar documentos/);
    assert.doesNotMatch(sent[0].text, /No prazo|Concluída|Projeto pausado/);
    // segunda rodada: nada repetido
    const r2 = await runAdminOverdueAlerts(admin, { now: new Date("2026-11-05T15:00:00-03:00") });
    assert.deepEqual(r2, { mails: 0, notified: 0 });
    // no dia seguinte a tarefa "só com dia" de hoje vira atrasada → só ela é avisada
    const r3 = await runAdminOverdueAlerts(admin, { now: new Date("2026-11-06T08:00:00-03:00") });
    assert.equal(r3.mails, 1);
    assert.match(sent[1].subject, /No prazo/);
    // de madrugada não manda
    tables.tasks.push({ id: "t6", title: "Madrugada", status: "a_fazer", due_date: "2026-11-06T13:00:00.000Z", project_id: "p1", assignee_id: "u2", organization_id: ORG });
    const r4 = await runAdminOverdueAlerts(admin, { now: new Date("2026-11-06T23:30:00-03:00") });
    assert.deepEqual(r4, { mails: 0, notified: 0 });
  });
});
