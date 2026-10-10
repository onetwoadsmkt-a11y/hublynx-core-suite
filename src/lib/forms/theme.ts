import type { CSSProperties } from "react";

import type { FormDraft } from "./domain";

/**
 * Cores da empresa aplicadas ao formulário público.
 * O visual veio do Lead Pro com a paleta fixa da ValeSafe (variáveis --vs-*);
 * aqui essas variáveis passam a vir da aparência configurada em cada formulário.
 */
function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Garante texto legível no card: se o contraste for baixo (< 4,5:1), usa preto ou branco. */
function readableInk(text: string, background: string): string {
  const lt = luminance(text);
  const lb = luminance(background);
  if (lt === null || lb === null) return text;
  const ratio = (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05);
  if (ratio >= 4.5) return text;
  return lb > 0.4 ? "#171717" : "#ffffff";
}

export function formThemeVars(tokens: FormDraft["appearance"]["tokens"]): CSSProperties {
  const primary = tokens.primary;
  return {
    "--vs-yellow": primary,
    "--vs-yellow-hover": `color-mix(in oklab, ${primary} 86%, black)`,
    "--vs-yellow-strong": `color-mix(in oklab, ${primary} 72%, black)`,
    "--vs-yellow-soft": `color-mix(in oklab, ${primary} 14%, white)`,
    "--vs-canvas": tokens.secondary,
    "--vs-surface": `color-mix(in oklab, ${tokens.secondary} 88%, white)`,
    "--vs-track": `color-mix(in oklab, ${tokens.secondary} 75%, white)`,
    "--vs-card": tokens.background,
    "--vs-ink": readableInk(tokens.text, tokens.background),
    "--shadow-vs-button": `0 10px 24px color-mix(in oklab, ${primary} 28%, transparent)`,
  } as CSSProperties;
}
