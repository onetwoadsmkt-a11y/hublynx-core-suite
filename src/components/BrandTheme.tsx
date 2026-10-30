import { useEffect, useLayoutEffect, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";

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

/** Escuro com marca clara: base grafite neutra (o amarelo vira destaque, sem brigar com o azul). */
const DARK_BASE_VARS = [
  "--background",
  "--app-bg",
  "--card",
  "--popover",
  "--secondary",
  "--muted",
  "--sidebar",
  "--sidebar-accent",
  "--accent-foreground",
] as const;
const GRAPHITE = {
  bg: "oklch(0.17 0.006 85)",
  card: "oklch(0.215 0.007 85)",
  raised: "oklch(0.27 0.009 85)",
  side: "oklch(0.19 0.006 85)",
};

export function darkBaseVars(): Record<(typeof DARK_BASE_VARS)[number], string> {
  return {
    "--background": GRAPHITE.bg,
    "--app-bg": GRAPHITE.bg,
    "--card": GRAPHITE.card,
    "--popover": GRAPHITE.card,
    "--secondary": GRAPHITE.raised,
    "--muted": GRAPHITE.raised,
    "--sidebar": GRAPHITE.side,
    "--sidebar-accent": GRAPHITE.raised,
    "--accent-foreground": "oklch(0.97 0.01 85)",
  };
}

/** Faixa do projeto e estados das tarefas no escuro, com a marca clara como destaque. */
export function vividDarkVars(hex: string): Record<(typeof VIVID_VARS)[number], string> {
  return {
    "--band-bg": GRAPHITE.raised,
    "--band-fg": "oklch(0.97 0.01 85)",
    "--band-sub": "rgb(255 255 255 / 0.72)",
    "--band-tile": "rgb(255 255 255 / 0.06)",
    "--band-chip": "rgb(255 255 255 / 0.1)",
    "--band-ring": hex,
    "--band-ring-track": "rgb(255 255 255 / 0.14)",
    "--band-cta-bg": hex,
    "--band-cta-fg": NAVY,
    "--band-late": "oklch(0.8 0.12 25)",
    "--task-ontime-bg": `color-mix(in oklab, ${hex} 12%, ${GRAPHITE.card})`,
    "--task-ontime-fg": `color-mix(in oklab, ${hex} 70%, white)`,
    "--task-today-bg": `color-mix(in oklab, ${hex} 30%, ${GRAPHITE.card})`,
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

  useIsoLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const clear = () => {
      BRAND_VARS.forEach((v) => root.style.removeProperty(v));
      VIVID_VARS.forEach((v) => root.style.removeProperty(v));
      DARK_BASE_VARS.forEach((v) => root.style.removeProperty(v));
    };
    if (!color || !HEX_RE.test(color)) {
      clear();
      return;
    }
    const vars = brandVars(color, dark);
    BRAND_VARS.forEach((v) => root.style.setProperty(v, vars[v]));
    if (isLightBrand(color)) {
      const vv = dark ? vividDarkVars(color) : vividVars(color);
      VIVID_VARS.forEach((v) => root.style.setProperty(v, vv[v]));
      if (dark) {
        const db = darkBaseVars();
        DARK_BASE_VARS.forEach((v) => root.style.setProperty(v, db[v]));
      } else DARK_BASE_VARS.forEach((v) => root.style.removeProperty(v));
    } else {
      VIVID_VARS.forEach((v) => root.style.removeProperty(v));
      DARK_BASE_VARS.forEach((v) => root.style.removeProperty(v));
    }
    return clear;
  }, [color, dark]);

  return null;
}
