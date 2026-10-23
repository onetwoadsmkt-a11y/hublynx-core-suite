import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { conditionsMatch, describeTrigger, renderTemplate, runKey, taskDueISO, triggerFires, type LeadFacts } from "./rules";

const lead: LeadFacts = {
  id: "l1", name: "Maria Souza", company: "Clínica Sorriso", email: "maria@x.com", phone: "",
  value: 5000, temperature: "quente", tags: ["Evento", "indicacao"], stage_id: "s1",
  stage_entered_at: "2026-10-10T12:00:00Z", openTasks: 0, overdueTasks: 0,
};

describe("automações — condições", () => {
  it("todas precisam bater", () => {
    assert.equal(conditionsMatch([{ field: "tags_any", value: ["evento"] }, { field: "temperature", value: ["quente"] }], lead), true);
    assert.equal(conditionsMatch([{ field: "tags_any", value: ["evento"] }, { field: "temperature", value: ["frio"] }], lead), false);
  });
  it("sem tag, valor, tarefas, e-mail e telefone", () => {
    assert.equal(conditionsMatch([{ field: "tags_none", value: ["perdido"] }], lead), true);
    assert.equal(conditionsMatch([{ field: "value_gte", value: 5000 }, { field: "value_lte", value: 9000 }], lead), true);
    assert.equal(conditionsMatch([{ field: "no_open_tasks" }], lead), true);
    assert.equal(conditionsMatch([{ field: "has_overdue_task" }], lead), false);
    assert.equal(conditionsMatch([{ field: "has_email" }], lead), true);
    assert.equal(conditionsMatch([{ field: "has_phone" }], lead), false);
  });
});

describe("automações — gatilhos", () => {
  it("ao entrar e ao entrar com tag", () => {
    assert.equal(triggerFires({ type: "on_enter" }, { kind: "enter" }, lead), true);
    assert.equal(triggerFires({ type: "on_enter_with_tag", tag: "EVENTO" }, { kind: "enter" }, lead), true);
    assert.equal(triggerFires({ type: "on_enter_with_tag", tag: "vip" }, { kind: "enter" }, lead), false);
  });
  it("ao receber tag", () => {
    assert.equal(triggerFires({ type: "on_tag_added", tag: "vip" }, { kind: "tag_added", tag: "VIP" }, lead), true);
    assert.equal(triggerFires({ type: "on_tag_added", tag: "vip" }, { kind: "enter" }, lead), false);
  });
  it("10 dias após entrar na etapa", () => {
    const t = { type: "after_time" as const, minutes: 10 * 1440 };
    assert.equal(triggerFires(t, { kind: "tick", now: new Date("2026-10-19T12:00:00Z") }, lead), false);
    assert.equal(triggerFires(t, { kind: "tick", now: new Date("2026-10-20T12:00:00Z") }, lead), true);
    assert.equal(describeTrigger(t), "10 dia(s) após entrar na etapa");
  });
  it("uma execução por passagem na etapa (e por tag recebida)", () => {
    assert.equal(runKey({ type: "on_enter" }, lead, { kind: "enter" }), "2026-10-10T12:00:00Z");
    assert.equal(runKey({ type: "on_tag_added", tag: "vip" }, lead, { kind: "tag_added", tag: "VIP" }), "2026-10-10T12:00:00Z#tag:vip");
  });
});

describe("automações — modelo de e-mail e tarefa", () => {
  it("troca as variáveis e mantém as desconhecidas", () => {
    assert.equal(
      renderTemplate("Olá {primeiro_nome}, da {empresa} — etapa {etapa}. {xyz}", lead, { etapa: "Proposta" }),
      "Olá Maria, da Clínica Sorriso — etapa Proposta. {xyz}",
    );
  });
  it("tarefa daqui a N dias no horário de São Paulo", () => {
    // 22/10 20:00 em SP (23:00Z) → amanhã 10:00 SP = 23/10 13:00Z
    assert.equal(taskDueISO(1, "10:00", new Date("2026-10-22T23:00:00Z")), "2026-10-23T13:00:00.000Z");
  });
});
