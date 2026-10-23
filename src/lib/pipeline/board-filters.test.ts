import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { activeFilterCount, applyBoardFilters, EMPTY_BOARD_FILTERS as E, originOptions, periodRange } from "./board-filters";
import { taskStatsByLead } from "./report-filters";

const now = new Date(2026, 9, 23, 10, 0);
const L = (id: string, x: Record<string, unknown> = {}) => ({ id, stage_id: "a", created_at: new Date(2026, 9, 20, 12).toISOString(), tags: [] as string[], ...x });
const leads = [
  L("1", { source: "Site", utm_source: "google", utm_campaign: "Black", temperature: "quente", tags: ["Lead Site"] }),
  L("2", { source: "Formulário FB", fbclid: "x", temperature: "frio", stage_id: "b", created_at: new Date(2026, 9, 23, 8).toISOString() }),
  L("3", { tags: ["QUALIFICADO", "Lead Site"], created_at: new Date(2026, 7, 1).toISOString() }),
];
const stats = taskStatsByLead([
  { lead_id: "1", done: false, due_at: new Date(2026, 9, 23, 15).toISOString() },
  { lead_id: "2", done: false, due_at: new Date(2026, 9, 21).toISOString() },
  { lead_id: "3", done: true, due_at: null },
], now);
const ctx = { stats, now, temperatureOf: (l: any) => l.temperature ?? null };
const ids = (f: Partial<typeof E>) => applyBoardFilters(leads, { ...E, ...f }, ctx).map((l) => l.id);

describe("filtros do pipeline", () => {
  it("período pela data de entrada", () => {
    assert.deepEqual(ids({ period: "hoje" }), ["2"]);
    assert.deepEqual(ids({ period: "7" }), ["1", "2"]);
    assert.deepEqual(ids({ period: "custom", from: "2026-08-01", to: "2026-08-01" }), ["3"]);
    assert.equal(periodRange({ period: "mes", from: "", to: "" }, now)?.from, "2026-10-01");
  });
  it("origem: fonte, UTM e anúncio; sem origem", () => {
    assert.deepEqual(ids({ origins: ["utm_source:google"] }), ["1"]);
    assert.deepEqual(ids({ origins: ["anuncio:meta", "source:site"] }), ["1", "2"]);
    assert.deepEqual(ids({ origins: ["source:"] }), ["3"]);
    const opts = originOptions(leads as any);
    assert.ok(opts.find((o) => o.key === "utm_campaign:black")?.label === "Black");
  });
  it("etapa, temperatura e tags (qualquer / todas)", () => {
    assert.deepEqual(ids({ stageIds: ["b"] }), ["2"]);
    assert.deepEqual(ids({ temperatures: ["quente", "morno"] }), ["1"]);
    assert.deepEqual(ids({ tags: ["lead site"] }), ["1", "3"]);
    assert.deepEqual(ids({ tags: ["lead site", "qualificado"], tagMode: "all" }), ["3"]);
  });
  it("tarefas: agendadas, hoje, atrasadas, sem", () => {
    assert.deepEqual(ids({ tasks: ["agendadas"] }), ["1", "2"]);
    assert.deepEqual(ids({ tasks: ["hoje"] }), ["1"]);
    assert.deepEqual(ids({ tasks: ["atrasadas"] }), ["2"]);
    assert.deepEqual(ids({ tasks: ["sem"] }), ["3"]);
  });
  it("combina grupos com E e conta filtros ativos", () => {
    assert.deepEqual(ids({ tags: ["lead site"], tasks: ["agendadas"] }), ["1"]);
    assert.equal(activeFilterCount({ ...E, period: "7", tags: ["a", "b"] }), 3);
  });
});
