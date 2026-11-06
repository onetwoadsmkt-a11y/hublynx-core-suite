import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dueDayKey, dueHasTime, overdueDays, overdueLabel, isDueToday, isOverdue, isPriorityLevel, unackedAlerts, dueAlerts, alertIsDue } from "./pending";

const now = new Date(2026, 9, 22, 15, 0, 0);

describe("tarefas atrasadas", () => {
  it("prazo de ontem e em aberto fica atrasado", () => {
    assert.equal(isOverdue({ due_date: "2026-10-21T14:00:00", status: "a_fazer" }, now), true);
  });
  it("prazo de hoje com horário já passado fica atrasado", () => {
    assert.equal(isOverdue({ due_date: "2026-10-22T08:00:00", status: "a_fazer" }, now), true);
    assert.equal(isOverdue({ due_date: new Date(2026, 9, 22, 14, 42).toISOString(), status: "a_fazer" }, now), true);
  });
  it("prazo de hoje com horário ainda por vir não fica atrasado", () => {
    assert.equal(isOverdue({ due_date: new Date(2026, 9, 22, 17, 42).toISOString(), status: "a_fazer" }, now), false);
    assert.equal(isDueToday({ due_date: new Date(2026, 9, 22, 17, 42).toISOString(), status: "a_fazer" }, now), true);
  });
  it("prazo de hoje só com dia (sem horário) não fica atrasado", () => {
    assert.equal(isOverdue({ due_date: "2026-10-22T00:00:00Z", status: "a_fazer" }, now), false);
    assert.equal(isOverdue({ due_date: new Date(2026, 9, 22, 0, 0).toISOString(), status: "a_fazer" }, now), false);
    assert.equal(isOverdue({ due_date: new Date(2026, 9, 22, 12, 0).toISOString(), status: "a_fazer" }, now), false);
    assert.equal(isOverdue({ due_date: "2026-10-22", status: "a_fazer" }, now), false);
    assert.equal(dueHasTime("2026-10-22T12:00:00-03:00"), false);
  });
  it("concluída ou cancelada nunca fica atrasada", () => {
    assert.equal(isOverdue({ due_date: "2026-10-01", status: "concluido" }, now), false);
    assert.equal(isOverdue({ due_date: "2026-10-01", status: "cancelado" }, now), false);
  });
  it("sem data não fica atrasada", () => {
    assert.equal(isOverdue({ due_date: null, status: "a_fazer" }, now), false);
  });
  it("dia inteiro (meia-noite UTC) usa o dia gravado", () => {
    assert.equal(dueDayKey("2026-10-22T00:00:00Z"), "2026-10-22");
    assert.equal(dueDayKey("2026-10-22T00:00:00+00:00"), "2026-10-22");
    assert.equal(dueDayKey("2026-10-22"), "2026-10-22");
  });
});

describe("prioridade e avisos", () => {
  it("alta e urgente (critica) são prioritárias", () => {
    assert.equal(isPriorityLevel("alta"), true);
    assert.equal(isPriorityLevel("critica"), true);
    assert.equal(isPriorityLevel("media"), false);
    assert.equal(isPriorityLevel(undefined), false);
  });
  it("aviso mostra só o que ainda não recebeu CIENTE", () => {
    const items = [
      { source: "task" as const, id: "a" },
      { source: "lead" as const, id: "a" },
      { source: "task" as const, id: "b" },
    ];
    const pending = unackedAlerts(items, ["task:a"]);
    assert.deepEqual(pending.map((i) => `${i.source}:${i.id}`), ["lead:a", "task:b"]);
  });
});

describe("overdueLabel", () => {
  const now = new Date("2026-11-03T20:00:00Z"); // 17:00 em SP
  it("dia inteiro vencido ontem", () => {
    assert.equal(overdueDays({ due_date: "2026-11-02", status: "a_fazer" }, now), 1);
    assert.equal(overdueLabel({ due_date: "2026-11-02", status: "a_fazer" }, now), "Atrasada há 1 dia");
    assert.equal(overdueLabel({ due_date: "2026-10-30T12:00:00Z", status: "a_fazer" }, now), "Atrasada há 4 dias");
  });
  it("hoje com horário passado", () => {
    assert.equal(overdueLabel({ due_date: "2026-11-03T15:42:00-03:00", status: "a_fazer" }, now), "Atrasada desde 15:42");
  });
  it("não atrasada", () => {
    assert.equal(overdueLabel({ due_date: "2026-11-03", status: "a_fazer" }, now), null);
    assert.equal(overdueLabel({ due_date: "2026-11-01", status: "concluido" }, now), null);
  });
});

describe("aviso de prioridade só no dia da tarefa", () => {
  // sexta 06/11/2026 17:30 em Brasília
  const now = new Date("2026-11-06T20:30:00Z");
  const it2 = (id: string, due: string | null) => ({ source: "task" as const, id, due });

  it("tarefa de segunda (09/11) não avisa na sexta; hoje, atrasada e sem prazo avisam", () => {
    assert.equal(alertIsDue("2026-11-09T00:00:00Z", now), false);
    assert.equal(alertIsDue("2026-11-09T12:00:00.000Z", now), false);
    assert.equal(alertIsDue("2026-11-06T00:00:00Z", now), true);
    assert.equal(alertIsDue("2026-11-06T23:30:00-03:00", now), true);
    assert.equal(alertIsDue("2026-11-03T00:00:00Z", now), true);
    assert.equal(alertIsDue(null, now), true);
    const out = dueAlerts([it2("seg", "2026-11-09T12:00:00Z"), it2("hoje", "2026-11-06T00:00:00Z")], [], now);
    assert.deepEqual(out.map((i) => i.id), ["hoje"]);
  });

  it("CIENTE dado na sexta não silencia o aviso de segunda", () => {
    const monday = new Date("2026-11-09T11:00:00Z"); // 08:00 em Brasília
    const acks = [{ key: "task:seg", at: "2026-11-06T20:00:00Z" }];
    assert.deepEqual(dueAlerts([it2("seg", "2026-11-09T12:00:00Z")], acks, monday).map((i) => i.id), ["seg"]);
    // CIENTE dado na própria segunda silencia
    const acks2 = [...acks, { key: "task:seg", at: "2026-11-09T11:05:00Z" }];
    assert.deepEqual(dueAlerts([it2("seg", "2026-11-09T12:00:00Z")], acks2, monday), []);
    // atrasada com CIENTE no dia do prazo: continua silenciada nos dias seguintes
    const tuesday = new Date("2026-11-10T12:00:00Z");
    assert.deepEqual(dueAlerts([it2("seg", "2026-11-09T12:00:00Z")], acks2, tuesday), []);
    // registro sem data (antigo) vale sempre
    assert.deepEqual(dueAlerts([it2("x", null)], [{ key: "task:x", at: null }], monday), []);
  });
});
