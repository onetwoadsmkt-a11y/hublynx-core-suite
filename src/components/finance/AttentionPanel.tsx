import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CalendarClock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/finance/Money";
import { getAlerts } from "@/lib/finance/finance.functions";

type Tone = "danger" | "warning" | "neutral";

const TONES: Record<Tone, { icon: string; value: string }> = {
  danger: { icon: "text-red-600 bg-red-500/10", value: "text-red-600" },
  warning: { icon: "text-amber-600 bg-amber-500/10", value: "text-amber-600" },
  neutral: { icon: "text-muted-foreground bg-muted", value: "text-foreground" },
};

function AttentionItem({
  label,
  icon: Icon,
  tone,
  count,
  amount,
  note,
  to,
}: {
  label: string;
  icon: LucideIcon;
  tone: Tone;
  count?: number;
  amount?: number;
  note?: string;
  to?: string;
}) {
  const t = TONES[tone];
  const body = (
    <Card className="h-full rounded-[14px] p-4 transition-colors hover:bg-muted/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`mt-1 text-[22px] font-semibold leading-tight ${t.value}`}>
            {amount !== undefined ? <Money value={amount} /> : (count ?? 0)}
          </p>
          <p className="mt-1 text-[12.2px] text-muted-foreground">
            {note ??
              (count !== undefined
                ? `${count} ${count === 1 ? "lançamento" : "lançamentos"}`
                : "")}
          </p>
        </div>
        <div className={`rounded-lg p-2 ${t.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
  return to ? (
    <Link to={to} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AttentionPanel(_props: { month: number; year: number }) {
  const alertsFn = useServerFn(getAlerts);

  const { data: alerts } = useQuery({
    queryKey: ["finance", "alerts"],
    queryFn: () => alertsFn(),
  });

  const items = alerts ?? [];
  const overdue = items.filter((a) => a.kind === "overdue");
  const today = items.filter((a) => a.kind === "upcoming" && a.days === 0);
  const sum = (list: typeof items) => list.reduce((s, a) => s + (a.saldo ?? 0), 0);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Atenção Necessária</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AttentionItem
          label="Vencidos"
          icon={AlertTriangle}
          tone={overdue.length > 0 ? "danger" : "neutral"}
          amount={sum(overdue)}
          note={`${overdue.length} ${overdue.length === 1 ? "lançamento" : "lançamentos"}`}
          to="/financeiro/receber"
        />
        <AttentionItem
          label="Vence hoje"
          icon={CalendarClock}
          tone={today.length > 0 ? "warning" : "neutral"}
          amount={sum(today)}
          note={`${today.length} ${today.length === 1 ? "lançamento" : "lançamentos"}`}
          to="/financeiro/receber"
        />
      </div>
    </section>
  );
}
