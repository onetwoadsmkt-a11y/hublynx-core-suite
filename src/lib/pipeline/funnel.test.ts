import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyStage, computeFunnel, countByTag, tagSlug } from "./funnel";

const st = (id: string, name: string, extra: Partial<{ is_won: boolean; is_lost: boolean }> = {}) =>
  ({ id, name, position: 0, is_won: false, is_lost: false, ...extra });

describe("funil · etapas e tags vindas do Kommo", () => {
  it("classifica as etapas do Kommo", () => {
    assert.equal(classifyStage(st("a", "NUTRÇÃO 2")), "nutricao");
    assert.equal(classifyStage(st("a", "nutrição")), "nutricao");
    assert.equal(classifyStage(st("a", "1° contato efetivo")), "conectado");
    assert.equal(classifyStage(st("a", "REUNIÃO AGENDADA THAIS")), "agendada");
    assert.equal(classifyStage(st("a", "reunião realizada")), "realizada");
    assert.equal(classifyStage(st("a", "NO SHOW (não participou)")), "noshow");
    assert.equal(classifyStage(st("a", "cof enviada")), "cof");
    assert.equal(classifyStage(st("a", "venda ganha", { is_won: true })), "ganho");
    assert.equal(classifyStage(st("a", "DESQUALIFICADO", { is_lost: true })), "perdido");
    assert.equal(classifyStage(st("a", "3° tentativa de contato")), "entrada");
  });

  it("tag do lead escrita como no Kommo casa com o slug configurado", () => {
    assert.equal(tagSlug("REUNIÃO REALIZADA"), "reuniao-realizada");
    const tags = [{ slug: "reuniao-realizada", name: "Reunião realizada", color: "#000", funnel_key: "realizada" as const }];
    const stages = [st("n", "nutrição")];
    const leads = [{ id: "1", stage_id: "n", value: null, source: null, created_at: "2026-01-01", tags: ["REUNIÃO REALIZADA"] }];
    const m = computeFunnel(stages, leads, { tags });
    assert.equal(m.realizadas, 1);
    assert.equal(countByTag(leads, tags)[0].count, 1);
  });
});
