import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { maskBRL } from "@/lib/security/value-lock";
import { Money, RegimeBadge, type Regime } from "@/components/finance/Money";

export const brl = (n: number) => maskBRL(n);

export function KpiCard({
  label,
  value,
  amount,
  icon: Icon,
  tone = "neutral",
  hint,
  regime,
}: {
  label: string;
  /** Pre-formatted string, used when `amount` is not provided. */
  value?: string;
  /** Numeric amount — renders monospaced with zero suppression. */
  amount?: number;
  icon: LucideIcon;
  tone?: "positive" | "negative" | "neutral" | "warning";
  hint?: string;
  regime?: Regime;
}) {
  const tones: Record<string, string> = {
    positive: "text-emerald-600 bg-emerald-500/10",
    negative: "text-red-600 bg-red-500/10",
    warning: "text-amber-600 bg-amber-500/10",
    neutral: "text-muted-foreground bg-muted",
  };
  const valueTone =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-red-600"
        : tone === "warning"
          ? "text-amber-600"
          : "text-foreground";

  return (
    <Card className="rounded-[14px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`mt-1 truncate text-[22px] font-semibold leading-tight ${valueTone}`}>
            {amount !== undefined ? <Money value={amount} /> : value}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {regime ? <RegimeBadge regime={regime} /> : null}
            {hint ? <span className="text-[12.2px] text-muted-foreground">{hint}</span> : null}
          </div>
        </div>
        <div className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}
