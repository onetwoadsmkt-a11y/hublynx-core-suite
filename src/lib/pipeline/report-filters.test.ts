import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyReportFilters, EMPTY_FILTERS, taskStatsByLead } from "./report-filters";

const now = new Date("2026-10-22T15:00:00Z");
const leads = [
  { id: "a", stage_id: "s1", temperature: "quente", tags: ["Evento"] },
  { id: "b", stage_id: "s2", temperature: "frio", tags: ["evento", "indicacao"] },
  { id: "c", stage_id: "s3", temperature: "morno", tags: [], converted_client_id: "cli" },
];
const stats = taskStatsByLead([
  { lead_id: "a", done: false, due_at: "2026-10-20T10:00:00Z" },
  { lead_id: "a", done: false, due_at: "2026-10-25T10:00:00Z" },
  { lead_id: "b", done: true, due_at: "2026-10-20T10:00:00Z" },
], now);
const ctx = {
  stagePipeline: new Map([["s1", "p1"], ["s2", "p1"], ["s3", "p2"]]),
  stats, wonStageIds: new Set<string>(), wonTagSlugs: new Set<string>(),
};
const ids = (f: Partial<typeof EMPTY_FILTERS>) => applyReportFilters(leads, { ...EMPTY_FILTERS, ...f }, ctx).map((l) => l.id);

describe("relatório comercial — filtros", () => {
  it("resume agendamentos: abertos, atrasados e próximo", () => {
    assert.deepEqual(stats.get("a"), { open: 2, overdue: 1, next: "2026-10-25T10:00:00Z" });
    assert.equal(stats.get("b"), undefined);
  });
  it("pipeline e etapas", () => {
    assert.deepEqual(ids({ pipelineId: "p1" }), ["a", "b"]);
    assert.deepEqual(ids({ stageIds: ["s2", "s3"] }), ["b", "c"]);
  });
  it("temperatura", () => assert.deepEqual(ids({ temperatures: ["quente", "morno"] }), ["a", "c"]));
  it("tags: qualquer uma ou todas", () => {
    assert.deepEqual(ids({ tags: ["evento"] }), ["a", "b"]);
    assert.deepEqual(ids({ tags: ["evento", "indicacao"], tagMode: "all" }), ["b"]);
  });
  it("tarefas atrasadas, sem tarefas e as duas juntas", () => {
    assert.deepEqual(ids({ overdueTasks: true }), ["a"]);
    assert.deepEqual(ids({ noTasks: true }), ["b", "c"]);
    assert.deepEqual(ids({ overdueTasks: true, noTasks: true }), ["a", "b", "c"]);
  });
  it("situação: leads x ganhos", () => {
    assert.deepEqual(ids({ situation: "leads" }), ["a", "b"]);
    assert.deepEqual(ids({ situation: "ganhos" }), ["c"]);
  });
});
