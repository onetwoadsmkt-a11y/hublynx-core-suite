import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dueDayKey, isOverdue, isPriorityLevel, unackedAlerts } from "./pending";

const now = new Date(2026, 9, 22, 15, 0, 0);

describe("tarefas atrasadas", () => {
  it("prazo de ontem e em aberto fica atrasado", () => {
    assert.equal(isOverdue({ due_date: "2026-10-21T14:00:00", status: "a_fazer" }, now), true);
  });
  it("prazo de hoje não fica atrasado, mesmo com horário já passado", () => {
    assert.equal(isOverdue({ due_date: "2026-10-22T08:00:00", status: "a_fazer" }, now), false);
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
