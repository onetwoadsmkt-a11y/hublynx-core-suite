import { useEffect } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * White label: aplica a cor da marca da empresa ativa no lugar do verde da Core Suite.
 * Só troca as variáveis de destaque (botões, menu ativo, foco, gráfico principal).
 * Fundo, cards e textos continuam os mesmos — o fundo nunca muda.
 */
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

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Texto escuro (navy da Core) ou branco, conforme o contraste com a cor da marca. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "oklch(0.18 0.06 263)" : "oklch(1 0 0)";
}

export function brandVars(hex: string): Record<(typeof BRAND_VARS)[number], string> {
  const fg = readableOn(hex);
  return {
    "--primary": hex,
    "--primary-foreground": fg,
    "--ring": hex,
    "--accent": `color-mix(in oklab, ${hex} 14%, white)`,
    "--accent-strong": `color-mix(in oklab, ${hex} 82%, black)`,
    "--sidebar-primary": hex,
    "--sidebar-primary-foreground": fg,
    "--sidebar-ring": hex,
    "--chart-1": hex,
  };
}

export function BrandTheme() {
  const { activeOrganization } = useWorkspace();
  const color = activeOrganization?.brandColor ?? null;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (!color || !HEX_RE.test(color)) {
      BRAND_VARS.forEach((v) => root.style.removeProperty(v));
      return;
    }
    const vars = brandVars(color);
    BRAND_VARS.forEach((v) => root.style.setProperty(v, vars[v]));
    return () => BRAND_VARS.forEach((v) => root.style.removeProperty(v));
  }, [color]);

  return null;
}
