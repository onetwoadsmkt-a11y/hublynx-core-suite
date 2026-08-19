import { maskBRL, useValuesUnlocked } from "@/lib/security/value-lock";

/** Monospaced money text with tabular numerals. Zero renders as a muted dot. */
export function Money({
  value,
  className = "",
  zeroDash = true,
}: {
  value: number | null | undefined;
  className?: string;
  zeroDash?: boolean;
}) {
  const unlocked = useValuesUnlocked();
  const v = value ?? 0;
  if (zeroDash && unlocked && v === 0) {
    return <span className={`font-mono text-[#CBD5E1] ${className}`}>·</span>;
  }
  return (
    <span className={`font-mono tabular-nums ${className}`} style={{ fontVariantNumeric: "tabular-nums" }}>
      {maskBRL(v)}
    </span>
  );
}

/** Plain string version for places that cannot host a component. */
export function moneyText(value: number | null | undefined) {
  const v = value ?? 0;
  return v === 0 ? "·" : maskBRL(v);
}

export type Regime = "competencia" | "caixa" | "acumulado";

const regimeStyles: Record<Regime, string> = {
  competencia: "bg-violet-100 text-violet-700",
  caixa: "bg-sky-100 text-sky-700",
  acumulado: "bg-slate-100 text-slate-600",
};

const regimeLabel: Record<Regime, string> = {
  competencia: "competência",
  caixa: "caixa",
  acumulado: "acumulado",
};

export function RegimeBadge({ regime }: { regime: Regime }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-medium leading-none ${regimeStyles[regime]}`}
    >
      {regimeLabel[regime]}
    </span>
  );
}
