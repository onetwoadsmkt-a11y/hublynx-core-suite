import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isWonLead } from "./lead-status";

const stages = new Set(["s-won"]);
const tags = new Set(["ganho", "fechado"]);

describe("lead ganho (vira cliente)", () => {
  it("convertido em cliente é ganho", () => assert.equal(isWonLead({ converted_client_id: "c1" }, stages, tags), true));
  it("em etapa marcada como ganha é ganho", () => assert.equal(isWonLead({ stage_id: "s-won" }, stages, tags), true));
  it("com tag de funil ganho é ganho, sem diferenciar maiúsculas", () => assert.equal(isWonLead({ tags: ["Fechado"] }, stages, tags), true));
  it("sem nada disso continua lead", () => assert.equal(isWonLead({ stage_id: "s1", tags: ["nutricao"] }, stages, tags), false));
});
