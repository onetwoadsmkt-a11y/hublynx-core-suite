import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getAlerts } from "@/lib/finance/finance.functions";

export function AlertsPanel() {
  const fn = useServerFn(getAlerts);
  const { data } = useQuery({ queryKey: ["finance", "alerts"], queryFn: () => fn() });
  const items = data ?? [];
  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">Alertas</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Tudo em dia.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => {
            const Icon = a.level === "red" ? AlertCircle : a.level === "yellow" ? AlertTriangle : CheckCircle2;
            const color =
              a.level === "red"
                ? "text-red-600 bg-red-500/10"
                : a.level === "yellow"
                ? "text-amber-600 bg-amber-500/10"
                : "text-emerald-600 bg-emerald-500/10";
            return (
              <li key={a.id} className="flex items-start gap-2 text-sm">
                <span className={`rounded p-1 ${color}`}><Icon className="h-3.5 w-3.5" /></span>
                <div className="min-w-0">
                  <p className="font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
