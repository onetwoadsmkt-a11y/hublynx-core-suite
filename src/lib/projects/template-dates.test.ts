import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { datesToOffsets, offsetsToDates, isoAdd } from "./template-dates";

describe("modelos de projeto por datas", () => {
  const ref = "2026-11-02";
  it("datas viram deslocamentos e voltam iguais", () => {
    const dated = [
      { start: "2026-11-02", end: "2026-11-06", tasks: [{ due: "2026-11-04" }] },
      { start: "2026-11-09", end: "2026-11-20", tasks: [] },
    ];
    const off = datesToOffsets(ref, dated);
    assert.deepEqual(off[0], { start_offset_days: 0, duration_days: 5, tasks: [{ due_offset_days: 2 }] });
    assert.deepEqual(off[1], { start_offset_days: 7, duration_days: 12, tasks: [] });
    assert.deepEqual(offsetsToDates(ref, off), dated);
  });
  it("modelo antigo sem dia inicial segue em sequência", () => {
    const d = offsetsToDates(ref, [
      { start_offset_days: null, duration_days: 3, tasks: [] },
      { start_offset_days: null, duration_days: 2, tasks: [] },
    ]);
    assert.deepEqual(d.map((s) => [s.start, s.end]), [["2026-11-02", "2026-11-04"], ["2026-11-05", "2026-11-06"]]);
  });
  it("não aceita etapa antes do início nem prazo antes do começo da etapa", () => {
    const [s] = datesToOffsets(ref, [{ start: "2026-10-30", end: "2026-10-29", tasks: [{ due: "2026-10-01" }] }]);
    assert.deepEqual(s, { start_offset_days: 0, duration_days: 1, tasks: [{ due_offset_days: 0 }] });
  });
  it("soma dias atravessando o mês", () => assert.equal(isoAdd("2026-10-30", 3), "2026-11-02"));
});
