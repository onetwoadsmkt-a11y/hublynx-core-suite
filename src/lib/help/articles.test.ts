import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HELP_CATEGORIES, searchHelp, visibleHelp } from "./articles";

describe("central de ajuda", () => {
  it("ids únicos e todo artigo com passos", () => {
    const ids = HELP_CATEGORIES.flatMap((c) => c.articles.map((a) => `${c.id}/${a.id}`));
    assert.equal(new Set(ids).size, ids.length);
    for (const c of HELP_CATEGORIES) for (const a of c.articles) assert.ok(a.steps.length > 1, a.id);
  });
  it("busca sem acento e por várias palavras", () => {
    const r = searchHelp(HELP_CATEGORIES, "automacao etapa");
    assert.ok(r.flatMap((c) => c.articles.map((a) => a.id)).includes("automacoes"));
    assert.equal(searchHelp(HELP_CATEGORIES, "xyzxyz").length, 0);
  });
  it("equipe de projeto vê só temas gerais; admin vê configurações", () => {
    assert.ok(visibleHelp({ projectOnly: true, isAdmin: false }).every((c) => c.access === "all"));
    assert.ok(!visibleHelp({ projectOnly: false, isAdmin: false }).some((c) => c.id === "configuracoes"));
    assert.ok(visibleHelp({ projectOnly: false, isAdmin: true }).some((c) => c.id === "configuracoes"));
  });
});
