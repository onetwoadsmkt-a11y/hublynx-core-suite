import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownCircle, ArrowUpCircle, Wallet, CircleDollarSign, Repeat, LineChart,
} from "lucide-react";
import { getFinanceMetrics } from "@/lib/finance/metrics.functions";
import { KpiCard } from "@/components/finance/KpiCard";
import { ProfitHeroCard } from "@/components/finance/ProfitHeroCard";
import { MonthYearPicker } from "@/components/finance/MonthYearPicker";
import { CashflowChart } from "@/components/finance/CashflowChart";
import { AlertsPanel } from "@/components/finance/AlertsPanel";
import { AttentionPanel } from "@/components/finance/AttentionPanel";
import { RevenueMixBar } from "@/components/finance/RevenueMixBar";


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

      {/* 1. Quatro números principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Receita Prevista" amount={k?.receita_mes ?? 0} icon={ArrowUpCircle} regime="competencia" hint="competência do mês" />
        <KpiCard label="Recebido" amount={k?.recebido_mes ?? 0} icon={Wallet} tone="positive" regime="caixa" hint="baixas do mês" />
        <KpiCard label="A Receber" amount={k?.a_receber_aberto ?? 0} icon={CircleDollarSign} tone="warning" regime="caixa" hint="em aberto no período" />
        <KpiCard label="Despesas" amount={k?.despesas_mes ?? 0} icon={ArrowDownCircle} tone="negative" regime="competencia" hint="sem repasse de mídia" />
      </div>

      {/* 2. Linha secundária */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ProfitHeroCard
          lucro={k?.lucro_mes ?? 0}
          receita={k?.receita_mes ?? 0}
          despesas={k?.despesas_mes ?? 0}
          margem={k?.margem}
        />
        <KpiCard label="Saldo Projetado" amount={k?.saldo_projetado ?? 0} icon={LineChart} tone="warning" regime="caixa" hint="caixa + aberto do período" />
        <KpiCard label="MRR" amount={k?.mrr ?? 0} icon={Repeat} regime="competencia" hint="recorrentes ativos" />
      </div>

      {/* 3. Atenção necessária */}
      <AttentionPanel month={month} year={year} />

      <RevenueMixBar month={month} year={year} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><CashflowChart /></div>
        <AlertsPanel />
      </div>
    </div>
  );
}
