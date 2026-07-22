import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays,
  format, isSameMonth, isSameDay, parseISO, isValid,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listFinances } from "@/lib/finance/finance.functions";
import { MonthYearPicker } from "@/components/finance/MonthYearPicker";
import { brl } from "@/components/finance/KpiCard";
import type { FinanceRow } from "@/lib/finance/types";

export const Route = createFileRoute("/_authenticated/financeiro/calendario")({
  head: () => ({ meta: [{ title: "Calendário Financeiro — Hublynx Core" }] }),
  component: FinanceCalendarPage,
});

function FinanceCalendarPage() {
  const navigate = useNavigate();
  const routerSearch = useRouterState({ select: (s) => s.location.search as { month?: number; year?: number } });
  const month = Number(routerSearch?.month) || new Date().getMonth() + 1;
  const year = Number(routerSearch?.year) || new Date().getFullYear();

  const listFn = useServerFn(listFinances);

  const { data: receivables } = useQuery({
    queryKey: ["finance", "list", "receber", month, year, "all"],
    queryFn: () => listFn({ data: { kind: "receber", month, year, status: "all" } }),
  });
  const { data: payables } = useQuery({
    queryKey: ["finance", "list", "pagar", month, year, "all"],
    queryFn: () => listFn({ data: { kind: "pagar", month, year, status: "all" } }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, { receber: FinanceRow[]; pagar: FinanceRow[] }>();
    const push = (rows: FinanceRow[] | undefined, key: "receber" | "pagar") => {
      for (const r of rows ?? []) {
        if (!r.due_date) continue;
        const bucket = map.get(r.due_date) ?? { receber: [], pagar: [] };
        bucket[key].push(r);
        map.set(r.due_date, bucket);
      }
    };
    push(receivables, "receber");
    push(payables, "pagar");
    return map;
  }, [receivables, payables]);

  const cursor = new Date(year, month - 1, 1);
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const totalReceber = (receivables ?? []).reduce((s, r) => s + r.amount, 0);
  const totalPagar = (payables ?? []).reduce((s, r) => s + r.amount, 0);
  const saldo = totalReceber - totalPagar;

  const weekLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthYearPicker
          month={month}
          year={year}
          onChange={(m, y) => navigate({ to: "/financeiro/calendario", search: { month: m, year: y } })}
        />
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">Receber:</span>
            <span className="font-semibold tabular-nums text-emerald-600">{brl(totalReceber)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Pagar:</span>
            <span className="font-semibold tabular-nums text-red-600">{brl(totalPagar)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Saldo:</span>{" "}
            <span className={cn("font-semibold tabular-nums", saldo >= 0 ? "text-emerald-600" : "text-red-600")}>
              {brl(saldo)}
            </span>
          </div>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-7 gap-px bg-border">
          {weekLabels.map((l) => (
            <div key={l} className="bg-muted text-[11px] font-medium uppercase text-muted-foreground px-2 py-1.5 text-center">
              {l}
            </div>
          ))}
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const bucket = byDay.get(key);
            const inMonth = isSameMonth(d, cursor);
            const isToday = isSameDay(d, new Date());
            const sumReceber = (bucket?.receber ?? []).reduce((s, r) => s + r.amount, 0);
            const sumPagar = (bucket?.pagar ?? []).reduce((s, r) => s + r.amount, 0);
            return (
              <div
                key={key}
                className={cn(
                  "bg-card min-h-[110px] p-1.5 flex flex-col gap-1",
                  !inMonth && "bg-muted/30 text-muted-foreground",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-xs font-semibold tabular-nums h-5 w-5 flex items-center justify-center rounded-full",
                      isToday && "bg-primary text-primary-foreground",
                    )}
                  >
                    {format(d, "d")}
                  </span>
                </div>
                <div className="space-y-1">
                  {sumReceber > 0 && (
                    <div
                      className="text-[11px] font-semibold rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-800 tabular-nums truncate"
                      title={`Receber: ${brl(sumReceber)} (${bucket!.receber.length})`}
                    >
                      + {brl(sumReceber)}
                    </div>
                  )}
                  {sumPagar > 0 && (
                    <div
                      className="text-[11px] font-semibold rounded px-1.5 py-0.5 bg-red-100 text-red-800 tabular-nums truncate"
                      title={`Pagar: ${brl(sumPagar)} (${bucket!.pagar.length})`}
                    >
                      − {brl(sumPagar)}
                    </div>
                  )}
                  {bucket && (bucket.receber.length + bucket.pagar.length > 0) && (
                    <div className="text-[10px] text-muted-foreground pl-0.5">
                      {bucket.receber.length + bucket.pagar.length} lançamento{bucket.receber.length + bucket.pagar.length > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Passe o mouse sobre um valor para ver a quantidade de lançamentos. Verde = receitas a receber, vermelho = despesas a pagar.
      </p>
    </div>
  );
}

export { FinanceCalendarPage };
