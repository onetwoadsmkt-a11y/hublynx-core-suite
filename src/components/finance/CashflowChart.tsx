import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { getCashflowSeries } from "@/lib/finance/finance.functions";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl } from "./KpiCard";

type Range = "30d" | "60d" | "90d" | "year";

export function CashflowChart() {
  const [range, setRange] = useState<Range>("90d");
  const fn = useServerFn(getCashflowSeries);
  const { data } = useQuery({
    queryKey: ["finance", "cashflow", range],
    queryFn: () => fn({ data: { range } }),
  });
  const series = useMemo(
    () =>
      (data ?? []).map((p) => ({
        date: new Date(p.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        Entradas: p.in,
        Saídas: p.out,
        Saldo: p.balance,
      })),
    [data],
  );
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Fluxo de Caixa</h3>
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
            <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => brl(v)} />
            <Legend />
            <Bar dataKey="Entradas" fill="hsl(142 71% 45%)" />
            <Bar dataKey="Saídas" fill="hsl(0 84% 60%)" />
            <Line type="monotone" dataKey="Saldo" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
