import { useEffect, useLayoutEffect, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBrandPalette } from "@/hooks/useBrandPalette";

/**
 * White label: aplica a cor da marca da empresa ativa no lugar do verde da Core Suite.
 * Só troca as variáveis de destaque (botões, menu ativo, foco, gráfico principal).
 * Fundo, cards e textos continuam os mesmos — o fundo nunca muda.
 */
const NAVY_TEXT = "oklch(0.18 0.06 263)";

const BRAND_VARS = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--accent",
  "--accent-strong",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
  "--chart-1",
] as const;

/** Marca de cor clara (amarelo, por exemplo): a cor domina a faixa do projeto e os destaques, com texto azul-marinho. */
const VIVID_VARS = [
  "--band-bg",
  "--band-fg",
  "--band-sub",
  "--band-tile",
  "--band-chip",
  "--band-ring",
  "--band-ring-track",
  "--band-cta-bg",
  "--band-cta-fg",
  "--band-late",
  "--task-ontime-bg",
  "--task-ontime-fg",
  "--task-today-bg",
  "--task-today-fg",
] as const;

const NAVY = NAVY_TEXT;
const HEADER_VARS = ["--brand-dark", "--brand-ink"] as const;

/** Hex → OKLCH (L 0–1, C, H em graus) — para montar o tema escuro a partir da cor da logo. */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const r = lin((n >> 16) & 255), g = lin((n >> 8) & 255), b = lin(n & 255);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.sqrt(A * A + B * B);
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c: C, h: H };
}

const ok = (l: number, c: number, h: number, a?: number) =>
  `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)}${a === undefined ? "" : ` / ${a}%`})`;

/** Variáveis de base trocadas no tema escuro de uma empresa com marca. */
const DARK_BASE_VARS = [
  "--background",
  "--app-bg",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent-foreground",
  "--border",
  "--input",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
] as const;

/**
 * Tema escuro na paleta da empresa: fundos no tom da cor escura da logo (ink),
 * com pouca saturação, em degraus de luminosidade fixos para os cards se destacarem
 * do fundo e os textos terem contraste (texto ~16:1, texto secundário ~8:1 nos cards).
 */
export type DarkStyle = "marca" | "preto";

export function darkBaseVars(ink: string, style: DarkStyle = "marca"): Record<(typeof DARK_BASE_VARS)[number], string> {
  const { c, h } = hexToOklch(HEX_RE.test(ink) ? ink : "#0a2557");
  const fg = ok(0.97, 0.006, h);
  if (style === "preto") {
    // fundo preto puro; cards em cinza-chumbo neutro, degraus de luminosidade para contraste
    return {
      "--background": "oklch(0 0 0)",
      "--app-bg": "oklch(0 0 0)",
      "--card": "oklch(0.185 0 0)",
      "--card-foreground": "oklch(0.97 0 0)",
      "--popover": "oklch(0.21 0 0)",
      "--popover-foreground": "oklch(0.97 0 0)",
      "--foreground": "oklch(0.97 0 0)",
      "--secondary": "oklch(0.26 0 0)",
      "--secondary-foreground": "oklch(0.97 0 0)",
      "--muted": "oklch(0.26 0 0)",
      "--muted-foreground": "oklch(0.78 0 0)",
      "--accent-foreground": "oklch(0.97 0 0)",
      "--border": "oklch(1 0 0 / 13%)",
      "--input": "oklch(1 0 0 / 17%)",
      "--sidebar": "oklch(0.09 0 0)",
      "--sidebar-foreground": "oklch(0.97 0 0)",
      "--sidebar-accent": "oklch(0.24 0 0)",
      "--sidebar-accent-foreground": "oklch(0.97 0 0)",
      "--sidebar-border": "oklch(1 0 0 / 11%)",
    };
  }
  const cc = Math.min(c, 0.035);
  return {
    "--background": ok(0.165, cc * 0.8, h),
    "--app-bg": ok(0.165, cc * 0.8, h),
    "--card": ok(0.215, cc, h),
    "--card-foreground": fg,
    "--popover": ok(0.235, cc, h),
    "--popover-foreground": fg,
    "--foreground": fg,
    "--secondary": ok(0.275, cc, h),
    "--secondary-foreground": fg,
    "--muted": ok(0.275, cc, h),
    "--muted-foreground": ok(0.78, 0.02, h),
    "--accent-foreground": fg,
    "--border": ok(0.97, 0.01, h, 12),
    "--input": ok(0.97, 0.01, h, 16),
    "--sidebar": ok(0.19, cc, h),
    "--sidebar-foreground": fg,
    "--sidebar-accent": ok(0.275, cc, h),
    "--sidebar-accent-foreground": fg,
    "--sidebar-border": ok(0.97, 0.01, h, 10),
  };
}

/** Cabeçalhos (tabelas, abas ativas, chips "Sua") na cor escura da logo; no escuro, um degrau acima dos cards. */
export function headerVars(ink: string, dark: boolean): Record<"--brand-dark" | "--brand-ink", string> {
  const safe = HEX_RE.test(ink) ? ink : "#0a2557";
  if (!dark) return { "--brand-dark": safe, "--brand-ink": safe };
  const { c, h } = hexToOklch(safe);
  return { "--brand-dark": ok(0.33, Math.min(c, 0.09), h), "--brand-ink": safe };
}

/** Faixa do projeto e estados das tarefas no escuro, com a marca clara como destaque. */
export function vividDarkVars(hex: string, ink = "#0a2557", style: DarkStyle = "marca"): Record<(typeof VIVID_VARS)[number], string> {
  const { c, h } = hexToOklch(HEX_RE.test(ink) ? ink : "#0a2557");
  return {
    "--band-bg": style === "preto" ? "oklch(0.235 0 0)" : ok(0.275, Math.min(c, 0.05), h),
    "--band-fg": ok(0.97, 0.006, h),
    "--band-sub": "rgb(255 255 255 / 0.74)",
    "--band-tile": "rgb(255 255 255 / 0.07)",
    "--band-chip": "rgb(255 255 255 / 0.12)",
    "--band-ring": hex,
    "--band-ring-track": "rgb(255 255 255 / 0.14)",
    "--band-cta-bg": hex,
    "--band-cta-fg": NAVY,
    "--band-late": "oklch(0.8 0.12 25)",
    "--task-ontime-bg": `color-mix(in oklab, ${hex} 12%, var(--card))`,
    "--task-ontime-fg": `color-mix(in oklab, ${hex} 70%, white)`,
    "--task-today-bg": `color-mix(in oklab, ${hex} 28%, var(--card))`,
    "--task-today-fg": `color-mix(in oklab, ${hex} 55%, white)`,
  };
}

export function isLightBrand(hex: string) {
  return readableOn(hex) === NAVY;
}

export function vividVars(hex: string): Record<(typeof VIVID_VARS)[number], string> {
  return {
    "--band-bg": hex,
    "--band-fg": NAVY,
    "--band-sub": "rgb(10 23 60 / 0.8)",
    "--band-tile": "rgb(255 255 255 / 0.55)",
    "--band-chip": "rgb(255 255 255 / 0.6)",
    "--band-ring": NAVY,
    "--band-ring-track": "rgb(10 23 60 / 0.16)",
    "--band-cta-bg": NAVY,
    "--band-cta-fg": "oklch(1 0 0)",
    "--band-late": "oklch(0.5 0.19 27)",
    "--task-ontime-bg": `color-mix(in oklab, ${hex} 18%, white)`,
    "--task-ontime-fg": `color-mix(in oklab, ${hex} 35%, oklch(0.25 0.05 70))`,
    "--task-today-bg": hex,
    "--task-today-fg": NAVY,
  };
}

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Texto escuro (navy da Core) ou branco, conforme o contraste com a cor da marca. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? NAVY_TEXT : "oklch(1 0 0)";
}

export function brandVars(hex: string, dark = false): Record<(typeof BRAND_VARS)[number], string> {
  const fg = readableOn(hex);
  return {
    "--primary": hex,
    "--primary-foreground": fg,
    "--ring": hex,
    // destaque suave: clarinho no claro; no escuro, tingido sobre o card (texto continua legível)
    // var(--card) é branco no claro e o card escuro no escuro
    "--accent": `color-mix(in oklab, ${hex} ${dark ? 20 : 14}%, var(--card))`,
    "--accent-strong": `color-mix(in oklab, ${hex} 82%, black)`,
    "--sidebar-primary": hex,
    "--sidebar-primary-foreground": fg,
    "--sidebar-ring": hex,
    "--chart-1": hex,
  };
}

// useLayoutEffect aplica a cor antes de a tela ser pintada (sem piscar o verde da Core).
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Acompanha o tema (classe "dark" no <html>, trocada pelo ThemeToggle). */
function useIsDark() {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setDark(root.classList.contains("dark")));
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    setDark(root.classList.contains("dark"));
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function BrandTheme() {
  const { brand } = useWorkspace();
  const color = brand?.brandColor ?? null;
  const dark = useIsDark();
  // cor escura da logo (Configurações › Aparência); sem logo, o navy do Core
  const { ink } = useBrandPalette();
  const darkStyle: DarkStyle = brand?.darkStyle === "preto" ? "preto" : "marca";
  const hasBrand = !!(color && HEX_RE.test(color)) || !!brand?.logoUrl;

  useIsoLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const clear = () => {
      BRAND_VARS.forEach((v) => root.style.removeProperty(v));
      VIVID_VARS.forEach((v) => root.style.removeProperty(v));
      DARK_BASE_VARS.forEach((v) => root.style.removeProperty(v));
      HEADER_VARS.forEach((v) => root.style.removeProperty(v));
    };
    if (!hasBrand) {
      clear();
      return;
    }
    const hv = headerVars(ink, dark);
    HEADER_VARS.forEach((v) => root.style.setProperty(v, hv[v]));
    if (dark) {
      const db = darkBaseVars(ink, darkStyle);
      DARK_BASE_VARS.forEach((v) => root.style.setProperty(v, db[v]));
    } else DARK_BASE_VARS.forEach((v) => root.style.removeProperty(v));
    if (!color || !HEX_RE.test(color)) {
      BRAND_VARS.forEach((v) => root.style.removeProperty(v));
      VIVID_VARS.forEach((v) => root.style.removeProperty(v));
      return clear;
    }
    const vars = brandVars(color, dark);
    BRAND_VARS.forEach((v) => root.style.setProperty(v, vars[v]));
    if (isLightBrand(color)) {
      const vv = dark ? vividDarkVars(color, ink, darkStyle) : vividVars(color);
      VIVID_VARS.forEach((v) => root.style.setProperty(v, vv[v]));
    } else VIVID_VARS.forEach((v) => root.style.removeProperty(v));
    return clear;
  }, [color, dark, ink, hasBrand, darkStyle]);

  return null;
}
