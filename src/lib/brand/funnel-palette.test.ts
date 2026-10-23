import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contrast, funnelPalette, luminance } from "./funnel-palette";

const STEPS = ["entrada", "conectado", "agendada", "realizada", "cof", "ganho"] as const;

describe("paleta do funil pela marca", () => {
  for (const [nome, primary, ink] of [
    ["Core", "#00D084", "#0A2557"],
    ["vermelho", "#E53935", "#2B0B0B"],
    ["amarelo claro", "#FFD400", "#1A1A1A"],
    ["marca escura sem cor viva", "#1B2A49", "#0A0F1E"],
    ["ink claro", "#7C4DFF", "#9E9E9E"],
  ] as const) {
    it(`${nome}: textos legíveis e faixas do escuro para a marca`, () => {
      const p = funnelPalette(primary, ink);
      for (const k of STEPS) assert.ok(contrast(p.layers[k].bg, p.layers[k].fg) >= 4.5, `${k} ${p.layers[k].bg}/${p.layers[k].fg}`);
      assert.ok(luminance(p.layers.entrada.bg) < luminance(p.layers.ganho.bg));
      for (const b of Object.values(p.blocks)) {
        assert.ok(contrast(b.light, "#FFFFFF") >= 4.5);
        assert.ok(contrast(b.dark, "#0B1220") >= 4.5);
      }
      assert.ok(contrast(p.dark, "#FFFFFF") >= 12);
      assert.ok(contrast(p.accent, p.accentFg) >= 3);
    });
  }
});
