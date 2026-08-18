import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { maskBRL } from "@/lib/security/value-lock";

export const brl = (n: number) => maskBRL(n);

export function KpiCard({
  label, value, icon: Icon, tone = "neutral", hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "positive" | "negative" | "neutral" | "warning";
  hint?: string;
}) {
  const tones: Record<string, string> = {
    positive: "text-emerald-600 bg-emerald-500/10",
    negative: "text-red-600 bg-red-500/10",
    warning: "text-amber-600 bg-amber-500/10",
    neutral: "text-primary bg-primary/10",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums truncate">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}
