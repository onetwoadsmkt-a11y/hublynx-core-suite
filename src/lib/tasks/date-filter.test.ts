import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesTaskDateRange } from "./date-filter";

describe("filtro de datas das tarefas", () => {
  const from = new Date(2026, 9, 21);
  const to = new Date(2026, 9, 23);
  it("inclui os dias inicial e final e exclui prazos fora do intervalo", () => {
    assert.equal(matchesTaskDateRange("2026-10-21", from, to), true);
    assert.equal(matchesTaskDateRange("2026-10-23T23:59:59", from, to), true);
    assert.equal(matchesTaskDateRange("2026-10-20", from, to), false);
    assert.equal(matchesTaskDateRange("2026-10-24", from, to), false);
  });
  it("filtra agendamentos com horário pelo mesmo dia local", () => {
    assert.equal(matchesTaskDateRange("2026-10-21T18:00:00", from, from), true);
    assert.equal(matchesTaskDateRange("2026-10-22T00:00:00", from, from), false);
  });
  it("aceita somente limite inicial ou final", () => {
    assert.equal(matchesTaskDateRange("2026-10-24", from), true);
    assert.equal(matchesTaskDateRange("2026-10-20", from), false);
    assert.equal(matchesTaskDateRange("2026-10-20", undefined, to), true);
    assert.equal(matchesTaskDateRange("2026-10-24", undefined, to), false);
  });
  it("mantém tarefas sem data apenas quando o intervalo está limpo", () => {
    assert.equal(matchesTaskDateRange(null), true);
    assert.equal(matchesTaskDateRange(null, from, to), false);
    assert.equal(matchesTaskDateRange("inválida", from, to), false);
  });
});