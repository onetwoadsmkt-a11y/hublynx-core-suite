import type { CSSProperties } from "react";

import type { FormDraft } from "./domain";

/**
 * Cores da empresa aplicadas ao formulário público.
 * O visual veio do Lead Pro com a paleta fixa da ValeSafe (variáveis --vs-*);
 * aqui essas variáveis passam a vir da aparência configurada em cada formulário.
 */
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
    "--vs-ink": tokens.text,
    "--shadow-vs-button": `0 10px 24px color-mix(in oklab, ${primary} 28%, transparent)`,
  } as CSSProperties;
}
