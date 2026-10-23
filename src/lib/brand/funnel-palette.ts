import type { StepKey } from "@/lib/pipeline/funnel-goals";

/**
 * Paleta do dashboard em funil gerada a partir da marca da empresa:
 * `primary` = cor de destaque (Configurações › Aparência ou a cor viva da logo) e
 * `ink` = cor escura da logo. As faixas vão do escuro (topo) até a cor da marca
 * (ganho), misturadas em OKLab para não ficarem acinzentadas, e os textos escolhem
 * branco ou escuro pelo contraste.
 */
type RGB = [number, number, number];
const STEP_ORDER: StepKey[] = ["entrada", "conectado", "agendada", "realizada", "cof", "ganho"];

export const parseHex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: RGB) =>
  `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

const lin = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const delin = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function luminance(hex: string) {
  const [r, g, b] = parseHex(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function toOklab(hex: string): RGB {
  const [r, g, b] = parseHex(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, a, b]: RGB): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return toHex([
    delin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    delin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    delin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

/** Mistura `a` → `b` (t = 0 é `a`, 1 é `b`) em OKLab. */
export function mix(a: string, b: string, t: number) {
  const A = toOklab(a), B = toOklab(b);
  return fromOklab([0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t) as RGB);
}

const WHITE = "#FFFFFF";
const BLACK = "#000000";

/** Escurece (ou clareia) até ter o contraste pedido contra `against`. */
function ensureContrast(color: string, against: string, min: number, toward: string) {
  let c = color;
  for (let t = 0.1; t <= 1 && contrast(c, against) < min; t += 0.1) c = mix(color, toward, t);
  return c;
}

export type FunnelPalette = {
  layers: Record<StepKey, { bg: string; fg: string; sub: string }>;
  blocks: Record<"topo" | "meio" | "fundo", { light: string; dark: string; bar: string }>;
  /** Fundo dos cards escuros (conversão e gargalo) e texto claro sobre ele. */
  dark: string;
  accent: string;
  accentFg: string;
};

export function funnelPalette(primary: string, ink: string): FunnelPalette {
  // Base escura bem escura (cards escuros e topo do funil).
  let deep = ink;
  if (luminance(deep) > 0.06) deep = ensureContrast(deep, WHITE, 12, BLACK);
  // Se a marca for tão escura quanto a base, o fim do funil precisa ficar mais claro para diferenciar.
  const end = luminance(primary) - luminance(deep) < 0.12 ? mix(primary, WHITE, 0.35) : primary;
  const start = mix(deep, end, 0.12);

  const layers = {} as FunnelPalette["layers"];
  STEP_ORDER.forEach((k, i) => {
    const bg = mix(start, end, i / (STEP_ORDER.length - 1));
    const fg = contrast(bg, WHITE) >= 4.5 ? WHITE : deep;
    const fgFinal = contrast(bg, fg) >= 4.5 ? fg : contrast(bg, WHITE) > contrast(bg, BLACK) ? WHITE : BLACK;
    layers[k] = { bg, fg: fgFinal, sub: mix(fgFinal, bg, 0.25) };
  });

  const block = (bar: string) => ({
    bar,
    light: ensureContrast(bar, WHITE, 4.5, deep === bar ? BLACK : deep),
    dark: ensureContrast(bar, "#0B1220", 4.5, WHITE),
  });

  return {
    layers,
    blocks: {
      topo: block(layers.conectado.bg),
      meio: block(layers.realizada.bg),
      fundo: block(layers.ganho.bg),
    },
    dark: deep,
    accent: primary,
    accentFg: contrast(primary, WHITE) >= 3 ? WHITE : deep,
  };
}
