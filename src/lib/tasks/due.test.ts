import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { dueFromParts, dueToParts, dueLabel, dueToLocalInput, localInputToIso, leadDueFromParts, dueDayOffset } from "./due";
import { dueHasTime, dueDayKey, isOverdue } from "./pending";

describe("prazo: gravar e mostrar", () => {
  test("só com dia → meia-noite UTC, sem hora", () => {
    const iso = dueFromParts("2026-11-10")!;
    assert.equal(iso, "2026-11-10T00:00:00.000Z");
    assert.deepEqual(dueToParts(iso), { date: "2026-11-10", time: "" });
    assert.equal(dueLabel(iso), "10/11/2026");
  });
  test("com hora → horário de Brasília", () => {
    const iso = dueFromParts("2026-11-10", "14:00")!;
    assert.equal(iso, "2026-11-10T17:00:00.000Z");
    assert.deepEqual(dueToParts(iso), { date: "2026-11-10", time: "14:00" });
    assert.equal(dueLabel(iso), "10/11/2026 · 14:00");
  });
  test("horários que coincidem com os marcadores continuam com hora", () => {
    for (const t of ["21:00", "00:00", "09:00", "12:00"]) {
      const iso = dueFromParts("2026-11-10", t)!;
      assert.equal(dueHasTime(iso), true, t);
      assert.deepEqual(dueToParts(iso), { date: "2026-11-10", time: t });
    }
  });
  test("22:30 fica no próprio dia", () => {
    const iso = dueFromParts("2026-11-10", "22:30")!;
    assert.equal(dueDayKey(iso), "2026-11-10");
    assert.equal(dueToParts(iso).time, "22:30");
  });
  test("convenções antigas de dia inteiro", () => {
    for (const iso of ["2026-11-10T00:00:00Z", "2026-11-10T03:00:00.000Z", "2026-11-10T12:00:00-03:00", "2026-11-10T12:00:00Z", "2026-11-10"]) {
      assert.deepEqual(dueToParts(iso), { date: "2026-11-10", time: "" }, iso);
    }
  });
  test("datetime-local ida e volta em Brasília", () => {
    const iso = dueFromParts("2026-11-10", "14:00")!;
    assert.equal(dueToLocalInput(iso), "2026-11-10T14:00");
    assert.equal(localInputToIso("2026-11-11T14:00"), "2026-11-11T17:00:00.000Z");
    assert.equal(dueToLocalInput("2026-11-10T00:00:00Z"), "2026-11-10T09:00");
  });
  test("agendamento de lead sem hora = 09:00, do dia", () => {
    const iso = leadDueFromParts("2026-11-10")!;
    assert.equal(iso, "2026-11-10T12:00:00.000Z");
    assert.equal(isOverdue({ due_date: iso, status: "a_fazer" }, new Date("2026-11-10T20:00:00-03:00")), false);
    assert.equal(isOverdue({ due_date: iso, status: "a_fazer" }, new Date("2026-11-11T08:00:00-03:00")), true);
  });
  test("dias até o prazo", () => {
    const now = new Date("2026-11-10T22:00:00-03:00");
    assert.equal(dueDayOffset("2026-11-10T00:00:00Z", now), 0);
    assert.equal(dueDayOffset(dueFromParts("2026-11-11", "08:00"), now), 1);
    assert.equal(dueDayOffset("2026-11-08T00:00:00Z", now), -2);
  });
});
