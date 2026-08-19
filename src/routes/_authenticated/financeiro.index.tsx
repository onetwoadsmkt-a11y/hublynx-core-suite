import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownCircle, ArrowUpCircle, Wallet, AlertCircle, Repeat, LineChart,
} from "lucide-react";
import { getFinanceMetrics } from "@/lib/finance/metrics.functions";
import { KpiCard } from "@/components/finance/KpiCard";
import { ProfitHeroCard } from "@/components/finance/ProfitHeroCard";
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
        <ProfitHeroCard
          lucro={k?.lucro_mes ?? 0}
          receita={k?.receita_mes ?? 0}
          despesas={k?.despesas_mes ?? 0}
          margem={k?.margem}
        />
        <KpiCard label="Recebido no Mês" amount={k?.recebido_mes ?? 0} icon={Wallet} tone="positive" regime="caixa" hint="baixas" />
        <KpiCard label="Inadimplência" amount={k?.inadimplencia ?? 0} icon={AlertCircle} tone={(k?.inadimplencia ?? 0) > 0 ? "negative" : "neutral"} regime="acumulado" hint="em atraso" />
        <KpiCard label="Receita do Mês" amount={k?.receita_mes ?? 0} icon={ArrowUpCircle} regime="competencia" hint="fee" />
        <KpiCard label="Despesas do Mês" amount={k?.despesas_mes ?? 0} icon={ArrowDownCircle} regime="competencia" hint="sem repasse de mídia" />
        <KpiCard label="Saldo Projetado" amount={k?.saldo_projetado ?? 0} icon={LineChart} tone="warning" regime="caixa" hint="caixa + aberto do período" />
        <KpiCard label="MRR" amount={k?.mrr ?? 0} icon={Repeat} regime="competencia" hint="recorrentes ativos" />
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><CashflowChart /></div>
        <AlertsPanel />
      </div>
    </div>
  );
}
