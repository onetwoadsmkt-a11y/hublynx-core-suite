import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownCircle, ArrowUpCircle, Calculator, Percent, Wallet, AlertCircle, Repeat, TrendingDown,
} from "lucide-react";
import { getFinanceDashboard } from "@/lib/finance/finance.functions";
import { KpiCard, brl } from "@/components/finance/KpiCard";
import { MonthYearPicker } from "@/components/finance/MonthYearPicker";
import { CashflowChart } from "@/components/finance/CashflowChart";
import { AlertsPanel } from "@/components/finance/AlertsPanel";

export const Route = createFileRoute("/_authenticated/financeiro/")({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const { month, year } = Route.useSearch();
  const fn = useServerFn(getFinanceDashboard);
  const { data } = useQuery({
    queryKey: ["finance", "dashboard", month, year],
    queryFn: () => fn({ data: { month, year } }),
  });
  const k = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <MonthYearPicker
          month={month}
          year={year}
          onChange={(m, y) => navigate({ to: "/financeiro", search: { month: m, year: y } })}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Receita do Mês" value={brl(k?.receita_realizada ?? 0)} icon={ArrowUpCircle} tone="positive" />
        <KpiCard label="Receita Prevista" value={brl(k?.receita_prevista ?? 0)} icon={ArrowUpCircle} />
        <KpiCard label="Despesas do Mês" value={brl(k?.despesa_realizada ?? 0)} icon={ArrowDownCircle} tone="negative" />
        <KpiCard label="Lucro do Mês" value={brl(k?.lucro ?? 0)} icon={Calculator} tone={(k?.lucro ?? 0) >= 0 ? "positive" : "negative"} />
        <KpiCard label="Margem" value={`${(k?.margem ?? 0).toFixed(1)}%`} icon={Percent} />
        <KpiCard label="Fluxo de Caixa" value={brl(k?.saldo_caixa ?? 0)} icon={Wallet} tone={(k?.saldo_caixa ?? 0) >= 0 ? "positive" : "negative"} />
        <KpiCard label="Inadimplência" value={brl(k?.inadimplencia ?? 0)} icon={AlertCircle} tone={(k?.inadimplencia ?? 0) > 0 ? "warning" : "neutral"} />
        <KpiCard label="MRR" value={brl(k?.mrr ?? 0)} icon={Repeat} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><CashflowChart /></div>
        <AlertsPanel />
      </div>
    </div>
  );
}
