import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownCircle, ArrowUpCircle, Wallet, CircleDollarSign } from "lucide-react";
import { getFinanceMetrics } from "@/lib/finance/metrics.functions";
import { KpiCard } from "@/components/finance/KpiCard";
import { MonthYearPicker } from "@/components/finance/MonthYearPicker";
import { CashflowChart } from "@/components/finance/CashflowChart";
import { AttentionPanel } from "@/components/finance/AttentionPanel";


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
        <KpiCard label="A Receber" amount={k?.a_receber_competencia ?? 0} icon={CircleDollarSign} tone="warning" regime="competencia" hint="saldo em aberto da competência" />
        <KpiCard label="Despesas" amount={k?.despesas_mes ?? 0} icon={ArrowDownCircle} tone="negative" regime="competencia" hint="sem repasse de mídia" />
      </div>

      {/* 2. Atenção: vencidos e o que vence hoje */}
      <AttentionPanel month={month} year={year} />

      <CashflowChart />
    </div>
  );
}
