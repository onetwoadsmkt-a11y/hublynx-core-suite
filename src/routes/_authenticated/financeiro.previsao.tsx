import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiCard, brl } from "@/components/finance/KpiCard";
import { AlertsPanel } from "@/components/finance/AlertsPanel";
import { TrendingUp, FileCheck2, CircleDashed, Wand2 } from "lucide-react";
import { getBillingForecast, generateForecastCharges } from "@/lib/finance/receivables.functions";

export const Route = createFileRoute("/_authenticated/financeiro/previsao")({
  component: PrevisaoPage,
});

function PrevisaoPage() {
  const search = Route.useSearch();
  const now = new Date();
  const startMonth = search.month ?? now.getMonth() + 1;
  const startYear = search.year ?? now.getFullYear();
  const fn = useServerFn(getBillingForecast);
  const gen = useServerFn(generateForecastCharges);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["finance", "billing-forecast", startYear, startMonth],
    queryFn: () => fn({ data: { startYear, startMonth, months: 12 } }),
  });

  const gap = useMemo(
    () => (data ? data.grandForecast - data.grandBooked : 0),
    [data],
  );

  async function generate(projectId: string, monthKeys: string[]) {
    setBusy(projectId);
    try {
      const res = await gen({ data: { projectId, monthKeys } });
      toast.success(
        res.created > 0
          ? `${res.created} cobrança(s) gerada(s).`
          : "Nenhuma cobrança pendente para gerar.",
      );
      await qc.invalidateQueries({ queryKey: ["finance"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar cobranças.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Previsto 12 meses"
          value={brl(data?.grandForecast ?? 0)}
          icon={TrendingUp}
          tone="positive"
          hint="Contratos recorrentes"
        />
        <KpiCard label="Já lançado" value={brl(data?.grandBooked ?? 0)} icon={FileCheck2} />
        <KpiCard
          label="A lançar"
          value={brl(gap > 0 ? gap : 0)}
          icon={CircleDashed}
          tone={gap > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Contratos ativos"
          value={String(data?.rows.length ?? 0)}
          icon={Wand2}
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h3 className="font-semibold">Previsão de Faturamento</h3>
            <p className="text-xs text-muted-foreground">
              Gerada automaticamente pelos projetos com contrato mensal recorrente.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium sticky left-0 bg-muted/50">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">Projeto</th>
                <th className="px-3 py-2 text-right font-medium">Valor/mês</th>
                <th className="px-3 py-2 text-center font-medium">Venc.</th>
                {(data?.labels ?? []).map((l) => (
                  <th key={l} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                    {l}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.projectId} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 sticky left-0 bg-background font-medium whitespace-nowrap">
                    {r.client}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.project}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(r.monthlyValue)}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">dia {r.billingDay}</td>
                  {r.forecast.map((v, i) => {
                    const booked = r.booked[i] ?? 0;
                    return (
                      <td
                        key={i}
                        className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${
                          booked > 0 ? "text-emerald-600" : "text-muted-foreground"
                        }`}
                      >
                        {brl(booked > 0 ? booked : v)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right">
                    {r.missing.length > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === r.projectId}
                        onClick={() => generate(r.projectId, r.missing)}
                      >
                        Gerar {r.missing.length}
                      </Button>
                    ) : (
                      <Badge variant="secondary">Completo</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {(data?.rows.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={17} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum projeto com contrato mensal recorrente. Defina o modelo comercial e o
                    valor mensal nos projetos para alimentar a previsão.
                  </td>
                </tr>
              )}
            </tbody>
            {(data?.rows.length ?? 0) > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/40 font-semibold">
                  <td className="px-3 py-2 sticky left-0 bg-muted/40">Total</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  {(data?.totalForecast ?? []).map((v, i) => (
                    <td key={i} className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                      {brl(v)}
                    </td>
                  ))}
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <AlertsPanel />
    </div>
  );
}
