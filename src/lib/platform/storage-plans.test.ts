import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PACKAGES, orgLimits, suggestPackage, usageLevel, fmtPrice } from "./storage-plans";

describe("planos de consumo", () => {
  it("limite = plano base + pacote extra", () => {
    assert.deepEqual(
      (({ database_mb, storage_mb }) => ({ database_mb, storage_mb }))(orgLimits(DEFAULT_PACKAGES, "extra1")),
      { database_mb: 1524, storage_mb: 15360 },
    );
    assert.equal(orgLimits(DEFAULT_PACKAGES, null).database_mb, 500);
  });
  it("faixas de aviso", () => {
    assert.equal(usageLevel(300, 500), "ok");
    assert.equal(usageLevel(420, 500), "warn");
    assert.equal(usageLevel(510, 500), "over");
  });
  it("sugere o menor pacote que comporta o uso com folga", () => {
    assert.equal(suggestPackage(DEFAULT_PACKAGES, { database_mb: 200, storage_mb: 1000 }), null);
    assert.equal(suggestPackage(DEFAULT_PACKAGES, { database_mb: 450, storage_mb: 1000 })?.code, "extra1");
    assert.equal(suggestPackage(DEFAULT_PACKAGES, { database_mb: 600, storage_mb: 20000 })?.code, "extra2");
    assert.equal(suggestPackage(DEFAULT_PACKAGES, { database_mb: 50000, storage_mb: 1 })?.code, "extra3");
  });
  it("valores ocultos por enquanto", () => {
    assert.equal(fmtPrice(169.9), "Valor oculto");
  });
});
