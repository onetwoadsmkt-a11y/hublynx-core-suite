import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownCircle, ArrowUpCircle, Calculator, Percent, Wallet, AlertCircle, Repeat, LineChart,
} from "lucide-react";
import { getFinanceMetrics } from "@/lib/finance/metrics.functions";
import { KpiCard, brl } from "@/components/finance/KpiCard";
import { MonthYearPicker } from "@/components/finance/MonthYearPicker";
import { CashflowChart } from "@/components/finance/CashflowChart";
import { AlertsPanel } from "@/components/finance/AlertsPanel";

export const Route = createFileRoute("/_authenticated/financeiro/")({
  component: DashboardPage,
});

export function formatMargem(m: number | null | undefined) {
  return m === null || m === undefined ? "—" : `${m.toFixed(1).replace(".", ",")}%`;
}

function DashboardPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const now = new Date();
  const month = search.month ?? now.getMonth() + 1;
  const year = search.year ?? now.getFullYear();
  const fn = useServerFn(getFinanceMetrics);
  const { data: k } = useQuery({
    queryKey: ["finance", "metrics", month, year],
    queryFn: () => fn({ data: { month, year } }),
  });

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
        <KpiCard label="Receita do Mês" value={brl(k?.receita_mes ?? 0)} icon={ArrowUpCircle} tone="positive" hint="Competência · fee" />
        <KpiCard label="Recebido no Mês" value={brl(k?.recebido_mes ?? 0)} icon={Wallet} hint="Baixas no caixa" />
        <KpiCard label="Despesas do Mês" value={brl(k?.despesas_mes ?? 0)} icon={ArrowDownCircle} tone="negative" hint="Sem repasse de mídia" />
        <KpiCard label="Lucro do Mês" value={brl(k?.lucro_mes ?? 0)} icon={Calculator} tone={(k?.lucro_mes ?? 0) >= 0 ? "positive" : "negative"} />
        <KpiCard label="Margem" value={formatMargem(k?.margem)} icon={Percent} />
        <KpiCard label="Saldo em Caixa" value={brl(k?.saldo_caixa ?? 0)} icon={Wallet} tone={(k?.saldo_caixa ?? 0) >= 0 ? "positive" : "negative"} />
        <KpiCard label="Saldo Projetado" value={brl(k?.saldo_projetado ?? 0)} icon={LineChart} hint="Caixa + aberto do período" tone={(k?.saldo_projetado ?? 0) >= 0 ? "positive" : "negative"} />
        <KpiCard label="Inadimplência" value={brl(k?.inadimplencia ?? 0)} icon={AlertCircle} tone={(k?.inadimplencia ?? 0) > 0 ? "warning" : "neutral"} />
        <KpiCard label="MRR" value={brl(k?.mrr ?? 0)} icon={Repeat} hint="Contratos recorrentes ativos" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><CashflowChart /></div>
        <AlertsPanel />
      </div>
    </div>
  );
}
