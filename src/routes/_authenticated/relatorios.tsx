import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { KpiCard, brl } from "@/components/finance/KpiCard";
import { MonthYearPicker } from "@/components/finance/MonthYearPicker";
import { formatMargem } from "./financeiro.index";
import { getFinanceMetrics, getFinanceMetricsSeries } from "@/lib/finance/metrics.functions";
import { ArrowUpCircle, ArrowDownCircle, Calculator, Percent, Wallet, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios financeiros — Hublynx Core" },
      {
        name: "description",
        content:
          "Receita, despesas, lucro e margem por competência, com acompanhamento mês a mês.",
      },
      { property: "og:title", content: "Relatórios financeiros — Hublynx Core" },
      {
        property: "og:description",
        content: "Indicadores de receita, despesas e lucro consolidados por competência.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const metricsFn = useServerFn(getFinanceMetrics);
  const seriesFn = useServerFn(getFinanceMetricsSeries);

  const { data: k } = useQuery({
    queryKey: ["finance", "metrics", month, year],
    queryFn: () => metricsFn({ data: { month, year } }),
  });
  const { data: s } = useQuery({
    queryKey: ["finance", "metrics-series", year, 1, 12],
    queryFn: () => seriesFn({ data: { startMonth: 1, startYear: year, months: 12 } }),
  });

  return (
    <div className="space-y-5">
      <MonthYearPicker
        month={month}
        year={year}
        onChange={(m, y) => {
          setMonth(m);
          setYear(y);
        }}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Receita do Mês" value={brl(k?.receita_mes ?? 0)} icon={ArrowUpCircle} tone="positive" />
        <KpiCard label="Recebido no Mês" value={brl(k?.recebido_mes ?? 0)} icon={Wallet} />
        <KpiCard label="Despesas do Mês" value={brl(k?.despesas_mes ?? 0)} icon={ArrowDownCircle} tone="negative" />
        <KpiCard label="Lucro do Mês" value={brl(k?.lucro_mes ?? 0)} icon={Calculator} tone={(k?.lucro_mes ?? 0) >= 0 ? "positive" : "negative"} />
        <KpiCard label="Margem" value={formatMargem(k?.margem)} icon={Percent} />
        <KpiCard label="Inadimplência" value={brl(k?.inadimplencia ?? 0)} icon={AlertCircle} tone={(k?.inadimplencia ?? 0) > 0 ? "warning" : "neutral"} />
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
          Resultado por competência · {year}
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/60">
                <th className="sticky left-0 z-10 bg-muted/60 px-2 py-2 text-left font-semibold">
                  Indicador
                </th>
                {(s?.labels ?? []).map((l) => (
                  <th key={l} className="px-2 py-2 text-right font-semibold whitespace-nowrap">{l}</th>
                ))}
                <th className="px-2 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Receita", values: s?.receita, total: s?.totals.receita, cls: "" },
                { label: "Recebido", values: s?.recebido, total: s?.totals.recebido, cls: "text-emerald-600" },
                { label: "Despesas", values: s?.despesas, total: s?.totals.despesas, cls: "text-red-600" },
                { label: "Lucro", values: s?.lucro, total: s?.totals.lucro, cls: "font-medium" },
              ].map((row) => (
                <tr key={row.label} className="border-b">
                  <td className="sticky left-0 z-10 bg-background px-2 py-1.5 font-medium">{row.label}</td>
                  {(row.values ?? []).map((v, i) => (
                    <td key={i} className={`px-2 py-1.5 text-right tabular-nums ${row.cls}`}>
                      {v > 0 ? brl(v) : "–"}
                    </td>
                  ))}
                  <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${row.cls}`}>
                    {brl(row.total ?? 0)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="sticky left-0 z-10 bg-background px-2 py-1.5 font-medium">Margem</td>
                {(s?.receita ?? []).map((v, i) => (
                  <td key={i} className="px-2 py-1.5 text-right tabular-nums">
                    {v > 0
                      ? `${(((s?.lucro[i] ?? 0) / v) * 100).toFixed(1).replace(".", ",")}%`
                      : "—"}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                  {formatMargem(
                    (s?.totals.receita ?? 0) > 0
                      ? ((s?.totals.lucro ?? 0) / (s?.totals.receita ?? 1)) * 100
                      : null,
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
