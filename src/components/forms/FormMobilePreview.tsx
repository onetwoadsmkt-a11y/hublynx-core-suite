import { ArrowLeft, ArrowRight, ImageIcon, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";

import type { FormDraft } from "@/lib/forms/domain";

const alignClasses = { left: "text-left", center: "text-center", right: "text-right" } as const;
const titleSizeClasses = { small: "text-xl", medium: "text-2xl", large: "text-3xl" } as const;
const bodySizeClasses = { small: "text-xs", medium: "text-sm", large: "text-base" } as const;
const colorClasses = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  primary: "text-accent-strong",
  blue: "text-form-text-blue",
  green: "text-form-text-green",
  red: "text-form-text-red",
  orange: "text-form-text-orange",
  purple: "text-form-text-purple",
} as const;

function formatClass(copy: Record<string, string>, target: "title" | "subtitle" | "question", sizeMap: typeof titleSizeClasses | typeof bodySizeClasses) {
  const align = copy[`${target}Align`] as keyof typeof alignClasses;
  const size = copy[`${target}Size`] as keyof typeof sizeMap;
  const color = copy[`${target}Color`] as keyof typeof colorClasses;
  return `${alignClasses[align] ?? alignClasses.left} ${sizeMap[size] ?? sizeMap.medium} ${copy[`${target}Color`]?.startsWith("#") ? "" : colorClasses[color] ?? colorClasses.default} ${copy[`${target}Weight`] === "normal" ? "font-normal" : "font-bold"} ${copy[`${target}Italic`] === "true" ? "italic" : "not-italic"}`;
}

function textStyle(copy: Record<string, string>, target: "title" | "subtitle" | "question"): CSSProperties | undefined {
  const color = copy[`${target}Color`];
  return color?.startsWith("#") ? { color } : undefined;
}

export function FormMobilePreview({ draft }: { draft: FormDraft }) {
  const copy = draft.appearance.copy;
  const activeFields = draft.fields.filter((field) => field.active !== false);
  const firstField = activeFields[0];
  const radiusClass = draft.appearance.tokens.radius === "small" ? "rounded-md" : draft.appearance.tokens.radius === "large" ? "rounded-3xl" : "rounded-2xl";
  const previewStyle = {
    "--preview-primary": draft.appearance.tokens.primary,
    "--preview-secondary": draft.appearance.tokens.secondary,
    "--preview-background": draft.appearance.tokens.background,
    "--preview-text": draft.appearance.tokens.text,
  } as CSSProperties;

  return (
    <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-[2rem] border-8 border-foreground shadow-card" style={previewStyle}>
      <div className="flex min-h-[38rem] flex-col bg-[var(--preview-background)] p-4 text-[var(--preview-text)] transition-colors duration-200">
        <div className="grid grid-cols-1 items-center gap-3">
          <div className="min-h-8 min-w-0">{draft.appearance.assets["logo"] ? <img src={draft.appearance.assets["logo"]} alt="Prévia do logo" className="h-7 max-w-28 object-contain object-left" /> : <span className="text-xs font-bold">{draft.name}</span>}</div>
        </div>
        {draft.mode === "scoring" ? <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--preview-secondary)] opacity-30"><div className="h-full min-w-4 bg-[var(--preview-primary)] transition-colors duration-200" style={{ width: `${activeFields.length ? 100 / activeFields.length : 100}%` }} /></div> : null}

        <div className={draft.appearance.presetKey === "immersive" ? "relative mt-4 overflow-hidden rounded-xl p-4" : "mt-4"}>
          {draft.appearance.presetKey === "immersive" && draft.appearance.assets["hero"] ? <img src={draft.appearance.assets["hero"]} alt="Prévia" className="absolute inset-0 size-full object-cover opacity-30" /> : null}
          <div className="relative z-10">
            <h3 className={formatClass(copy, "title", titleSizeClasses)} style={textStyle(copy, "title")}>{copy["title"] || draft.name}</h3>
            <p className={`mt-2 ${formatClass(copy, "subtitle", bodySizeClasses)}`} style={textStyle(copy, "subtitle")}>{copy["subtitle"] || "Subtítulo do formulário"}</p>
          </div>
        </div>

        {draft.appearance.presetKey !== "immersive" && draft.appearance.assets["hero"] ? <img src={draft.appearance.assets["hero"]} alt="Prévia" className={`mt-4 aspect-[16/9] w-full object-cover ${radiusClass}`} /> : draft.appearance.presetKey !== "immersive" ? <div className={`mt-4 grid aspect-[16/9] place-items-center border border-dashed border-current opacity-40 ${radiusClass}`}><ImageIcon className="size-6" /></div> : null}

        <div className={`mt-4 bg-card p-4 text-card-foreground shadow-card transition-[border-radius] duration-200 ${radiusClass}`}>
          {draft.mode === "direct" ? activeFields.slice(0, 3).map((field) => <div key={field.key} className="mb-3"><p className={`mb-1 ${formatClass(copy, "question", bodySizeClasses)}`} style={textStyle(copy, "question")}>{field.label}</p>{field.description ? <p className="mb-1 text-[0.625rem] text-muted-foreground">{field.description}</p> : null}<div className={`grid h-9 items-center border border-input bg-background px-3 text-[0.625rem] text-muted-foreground ${radiusClass}`}>{field.placeholder || "Digite aqui"}</div></div>) : <><p className={formatClass(copy, "question", titleSizeClasses)} style={textStyle(copy, "question")}>{firstField?.label ?? "Sua primeira pergunta"}</p>{firstField?.description ? <p className="mt-1 text-xs text-muted-foreground">{firstField.description}</p> : null}<div className={`mt-3 grid h-10 items-center border border-input bg-background px-3 text-xs text-muted-foreground ${radiusClass}`}>{firstField?.placeholder || "Digite sua resposta"}</div></>}
          <div className={`mt-4 flex h-11 items-center justify-center gap-2 bg-[var(--preview-primary)] px-3 text-sm font-bold text-[var(--preview-secondary)] transition-colors duration-200 ${radiusClass}`}>{draft.mode === "direct" ? copy["submitLabel"] || "Enviar" : <>Continuar <ArrowRight className="size-3.5" /></>}</div>
        </div>
        {draft.mode === "scoring" ? <div className="mt-3 flex items-center justify-between text-[0.6rem] font-bold uppercase opacity-50"><span className="flex items-center gap-1"><ArrowLeft className="size-3" /> Voltar</span><span className="flex items-center gap-1"><ShieldCheck className="size-3" /> Ambiente seguro</span></div> : null}
        <p className="mt-auto pt-5 text-center text-[0.55rem] font-semibold uppercase opacity-40">{copy["footer"] || "Formulário seguro"}</p>
      </div>
    </div>
  );
}