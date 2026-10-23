import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeGoalFunnel, DEFAULT_GOALS, normalizeGoals } from "./funnel-goals";

const st = (id: string, name: string, extra: Partial<{ is_won: boolean; is_lost: boolean }> = {}) =>
  ({ id, name, position: 0, is_won: false, is_lost: false, ...extra });
const stages = [
  st("s1", "Leads de entrada"),
  st("s2", "Contato efetivo"),
  st("s3", "Reunião agendada"),
  st("s4", "Reunião realizada"),
  st("s5", "Proposta enviada"),
  st("s6", "Venda ganha", { is_won: true }),
  st("s7", "Desqualificado", { is_lost: true }),
  st("s8", "Diagnóstico"), // nome que o sistema não reconhece sozinho
];

describe("funil por objetivo", () => {
  it("é cumulativo: quem está na proposta também passou pelos anteriores", () => {
    const f = computeGoalFunnel(stages, [{ id: "a", stage_id: "s5", value: 100 }], DEFAULT_GOALS);
    assert.deepEqual(f.steps.map((s) => s.count), [1, 1, 1, 1, 1, 0]);
  });

  it("histórico: lead perdido depois da proposta continua contando até a proposta", () => {
    const leads = [{ id: "a", stage_id: "s7", value: 0 }];
    const sem = computeGoalFunnel(stages, leads, { ...DEFAULT_GOALS, useHistory: false });
    const com = computeGoalFunnel(stages, leads, DEFAULT_GOALS, { history: { a: ["s2", "s3", "s5"] } });
    assert.equal(sem.steps[4].count, 0);
    assert.equal(com.steps[4].count, 1);
    assert.equal(com.exits.perdido, 1);
  });

  it("papel definido pelo usuário vence a adivinhação pelo nome", () => {
    const leads = [{ id: "a", stage_id: "s8", value: 0 }];
    assert.equal(computeGoalFunnel(stages, leads, DEFAULT_GOALS).steps[3].count, 0);
    const g = { ...DEFAULT_GOALS, stageMap: { s8: "realizada" as const } };
    assert.equal(computeGoalFunnel(stages, leads, g).steps[3].count, 1);
  });

  it("conversão segue o objetivo escolhido e compara com a meta", () => {
    const leads = [
      { id: "a", stage_id: "s3", value: 0 }, { id: "b", stage_id: "s1", value: 0 },
      { id: "c", stage_id: "s6", value: 500 }, { id: "d", stage_id: "s2", value: 0 },
    ];
    const ganho = computeGoalFunnel(stages, leads, { ...DEFAULT_GOALS, targets: { leads: null, conversion: 30, steps: {} } });
    assert.equal(ganho.objective.rate, 25);
    assert.equal(ganho.objective.belowTarget, true);
    assert.equal(ganho.wonValue, 500);
    const reuniao = computeGoalFunnel(stages, leads, { ...DEFAULT_GOALS, objective: "agendada" });
    assert.equal(reuniao.objective.rate, 50);
  });

  it("tags de funil contam quando ligadas", () => {
    const leads = [{ id: "a", stage_id: "s1", value: 0, tags: ["Reuniao-feita"] }];
    const tags = [{ slug: "reuniao-feita", funnel_key: "realizada" }];
    assert.equal(computeGoalFunnel(stages, leads, DEFAULT_GOALS, { tags }).steps[3].count, 1);
    assert.equal(computeGoalFunnel(stages, leads, { ...DEFAULT_GOALS, useTags: false }, { tags }).steps[3].count, 0);
  });

  it("aponta o gargalo até o objetivo e normaliza configurações antigas", () => {
    const leads = Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, stage_id: i < 2 ? "s6" : i < 3 ? "s5" : "s2", value: 0 }));
    const f = computeGoalFunnel(stages, leads, DEFAULT_GOALS);
    assert.equal(f.worst?.to, "agendada");
    assert.equal(normalizeGoals({ objective: "entrada" }).objective, "ganho");
    assert.equal(normalizeGoals(null).useHistory, true);
  });
});
