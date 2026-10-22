import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendNote, noteLines } from "./lead-task-notes";

const when = new Date("2026-10-22T22:50:00Z"); // 19:50 em São Paulo

describe("observações do agendamento", () => {
  it("acrescenta linha datada sem apagar o que havia", () => {
    const n = appendNote("Ligar pela manhã", "Cliente pediu proposta", "", when);
    assert.deepEqual(noteLines(n), ["Ligar pela manhã", "[22/10, 19:50] Cliente pediu proposta"]);
  });
  it("marca o resultado ao concluir", () => {
    assert.equal(appendNote(null, "Fechou reunião", "Resultado: ", when), "[22/10, 19:50] Resultado: Fechou reunião");
  });
  it("mantém só os últimos 8000 caracteres", () => {
    assert.ok(appendNote("x".repeat(9000), "novo", "", when).length <= 8000);
  });
});

import { defaultNextDue } from "./lead-task-notes";
describe("próxima ação sugerida", () => {
  it("vai para o próximo dia útil às 10h", () => {
    assert.equal(defaultNextDue(new Date(2026, 9, 22, 19, 0)), "2026-10-23T10:00"); // quinta → sexta
    assert.equal(defaultNextDue(new Date(2026, 9, 23, 19, 0)), "2026-10-26T10:00"); // sexta → segunda
  });
});
