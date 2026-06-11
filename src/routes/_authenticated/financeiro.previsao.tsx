import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getForecast } from "@/lib/finance/finance.functions";
import { brl } from "@/components/finance/KpiCard";
import { AlertsPanel } from "@/components/finance/AlertsPanel";

export const Route = createFileRoute("/_authenticated/financeiro/previsao")({
  component: PrevisaoPage,
});

function PrevisaoPage() {
  const fn = useServerFn(getForecast);
  const { data } = useQuery({ queryKey: ["finance", "forecast"], queryFn: () => fn() });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {(data ?? []).map((b) => (
          <Card key={b.label} className="p-4">
            <h3 className="font-semibold">{b.label}</h3>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Recebimentos</span><span className="text-emerald-600 tabular-nums">{brl(b.receivables)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pagamentos</span><span className="text-red-600 tabular-nums">−{brl(b.payables)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Saldo</span><span className={`tabular-nums ${b.saldo >= 0 ? "text-emerald-600" : "text-red-600"}`}>{brl(b.saldo)}</span></div>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs max-h-48 overflow-auto">
              {b.items.map((it) => (
                <li key={it.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    <Badge variant={it.kind === "receber" ? "default" : "secondary"} className="mr-1">
                      {it.kind === "receber" ? "R" : "D"}
                    </Badge>
                    {it.description || "—"} • {it.due_date}
                  </span>
                  <span className="tabular-nums">{brl(it.amount)}</span>
                </li>
              ))}
              {b.items.length === 0 && <li className="text-muted-foreground">Sem lançamentos.</li>}
            </ul>
          </Card>
        ))}
      </div>
      <AlertsPanel />
    </div>
  );
}
