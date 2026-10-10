import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TRIAL_DAYS, TRIAL_MODULE_CODES, trialEndsAt, trialHasExpired } from "./trial-rules";

describe("teste automático", () => {
  it("dura exatamente 14 dias desde o cadastro", () => {
    assert.equal(TRIAL_DAYS, 14);
    assert.equal(trialEndsAt("2026-10-10T21:58:00.000Z"), "2026-10-24T21:58:00.000Z");
  });
  it("libera durante o teste e bloqueia no instante do vencimento", () => {
    const end = "2026-10-24T21:58:00.000Z";
    assert.equal(trialHasExpired(end, Date.parse("2026-10-24T21:57:59.999Z")), false);
    assert.equal(trialHasExpired(end, Date.parse(end)), true);
  });
  it("não aplica vencimento de teste a empresas sem data de teste", () => {
    assert.equal(trialHasExpired(null), false);
  });
  it("limita a liberação automática aos módulos públicos escolhidos", () => {
    assert.deepEqual(TRIAL_MODULE_CODES, ["crm", "tasks", "projects"]);
  });
});