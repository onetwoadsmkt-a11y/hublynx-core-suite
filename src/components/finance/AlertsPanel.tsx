import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { getAlerts } from "@/lib/finance/finance.functions";
import { formatDateBR } from "@/lib/finance/format";
import { Money } from "@/components/finance/Money";
import { BaixaDialog } from "@/components/finance/BaixaDialog";

export function AlertsPanel() {
  const fn = useServerFn(getAlerts);
  const { data } = useQuery({ queryKey: ["finance", "alerts"], queryFn: () => fn() });
  const items = data ?? [];
  const [financeId, setFinanceId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">Alertas</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Tudo em dia.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((a) => {
            const overdue = a.kind === "overdue";
            const clickable = !!a.finance_id;
            const dayText =
              a.kind === "overdue"
                ? `${a.days} ${a.days === 1 ? "dia" : "dias"} em atraso`
                : a.kind === "upcoming"
                ? a.days === 0
                  ? "vence hoje"
                  : `vence em ${a.days} ${a.days === 1 ? "dia" : "dias"}`
                : `renova em ${formatDateBR(a.due_date)}`;

            const content = (
              <div className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold text-[14px] text-foreground truncate">
                    {a.client_name || a.title}
                  </p>
                  <p className="text-[12.2px] text-muted-foreground truncate">
                    {[a.service_line, a.installment_label].filter(Boolean).join(" • ") ||
                      a.description}
                  </p>
                  {a.due_date && a.kind !== "contract" ? (
                    <p className="text-[12.2px] text-muted-foreground">
                      Vencimento {formatDateBR(a.due_date)}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  {a.kind !== "contract" ? (
                    <Money
                      value={a.saldo ?? 0}
                      zeroDash={false}
                      className={`text-[14.5px] font-semibold ${
                        overdue ? "text-red-600" : "text-amber-600"
                      }`}
                    />
                  ) : null}
                  <p
                    className={`text-[12.2px] ${
                      overdue ? "text-red-600" : "text-muted-foreground"
                    }`}
                  >
                    {dayText}
                  </p>
                </div>
              </div>
            );

            return (
              <li key={a.id}>
                {clickable ? (
                  <button
                    type="button"
                    className="w-full text-left rounded-md px-1 hover:bg-muted/60 transition-colors"
                    onClick={() => {
                      setFinanceId(a.finance_id as string);
                      setOpen(true);
                    }}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="px-1">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <BaixaDialog financeId={financeId} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
