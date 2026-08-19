import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { getCashflowSeries } from "@/lib/finance/finance.functions";
import { getFinanceMetrics } from "@/lib/finance/metrics.functions";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Money } from "./Money";
import { brl } from "./KpiCard";

type Range = "30d" | "60d" | "90d" | "year";

const rangeLabel: Record<Range, string> = {
  "30d": "30 dias",
  "60d": "60 dias",
  "90d": "90 dias",
  year: "12 meses",
};

export function CashflowChart() {
  const [range, setRange] = useState<Range>("90d");
  const fn = useServerFn(getCashflowSeries);
  const { data } = useQuery({
    queryKey: ["finance", "cashflow", range],
    queryFn: () => fn({ data: { range } }),
  });

  const now = new Date();
  const metricsFn = useServerFn(getFinanceMetrics);
  const { data: metrics } = useQuery({
    queryKey: ["finance", "metrics", now.getMonth() + 1, now.getFullYear()],
    queryFn: () => metricsFn({ data: { month: now.getMonth() + 1, year: now.getFullYear() } }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const series = useMemo(() => {
    const saldoInicial = metrics?.saldo_caixa ?? 0;
    let acc = saldoInicial;
    return (data ?? []).map((p) => {
      const future = p.date > today;
      acc += p.in - p.out;
      return {
        date: new Date(p.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        future,
        Entradas: p.in,
        Saídas: p.out,
        "Saldo acumulado": acc,
      };
    });
  }, [data, metrics?.saldo_caixa, today]);

  const hasFuture = series.some((s) => s.future);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-semibold">Saldo projetado em {rangeLabel[range]}</h3>
          <p className="text-[12.2px] text-muted-foreground">
            Saldo de hoje: <Money value={metrics?.saldo_caixa ?? 0} className="text-foreground" zeroDash={false} />
            {hasFuture ? " · barras translúcidas: projeção pelo vencimento" : ""}
          </p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="30d">30d</TabsTrigger>
            <TabsTrigger value="60d">60d</TabsTrigger>
            <TabsTrigger value="90d">90d</TabsTrigger>
            <TabsTrigger value="year">Ano</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis yAxisId="left" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <YAxis
              yAxisId="right"
              orientation="right"
              fontSize={11}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip formatter={(v: number) => brl(v)} />
            <Legend />
            <Bar yAxisId="left" dataKey="Entradas" fill="hsl(142 71% 45%)">
              {series.map((p, i) => (
                <Cell key={i} fillOpacity={p.future ? 0.35 : 1} />
              ))}
            </Bar>
            <Bar yAxisId="left" dataKey="Saídas" fill="hsl(0 84% 60%)">
              {series.map((p, i) => (
                <Cell key={i} fillOpacity={p.future ? 0.35 : 1} />
              ))}
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="Saldo acumulado"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {hasFuture ? (
        <p className="mt-2 text-[12.2px] text-muted-foreground">
          Meses futuros em barra translúcida — projeção pelo vencimento.
        </p>
      ) : null}
    </Card>
  );
}
