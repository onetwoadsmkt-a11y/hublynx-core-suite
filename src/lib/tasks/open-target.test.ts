import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openTargetFor } from "./open-target";

const T = "11111111-1111-1111-1111-111111111111";
const P = "22222222-2222-2222-2222-222222222222";

describe("openTargetFor", () => {
  it("tarefa de projeto abre dentro do projeto", () => {
    assert.deepEqual(openTargetFor(T, { project_id: P, leadTask: null }), { kind: "project", projectId: P, taskId: T });
  });
  it("tarefa sem projeto abre a janela da tarefa", () => {
    assert.deepEqual(openTargetFor(T, { project_id: null, leadTask: null }), { kind: "task", id: T });
  });
  it("agendamento de lead abre o agendamento, mesmo com projeto do lead convertido", () => {
    assert.deepEqual(openTargetFor(`lead:${T}`, { project_id: P, leadTask: { id: T } }), { kind: "lead", id: `lead:${T}` });
  });
});
