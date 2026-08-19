import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, RefreshCw, TriangleAlert, X } from "lucide-react";
import { Money } from "@/components/finance/Money";
import { formatCompetenciaBR } from "@/lib/finance/format";
import { getReconciliation } from "@/lib/finance/reconciliation.functions";

export const Route = createFileRoute("/_authenticated/financeiro/conciliacao")({
  head: () => ({
    meta: [
      { title: "Conciliação Financeira — Hublynx Core" },
      {
        name: "description",
        content:
          "Testes ao vivo sobre os dados reais do financeiro: receita, caixa, inadimplência, repasse e linhas de serviço.",
      },
      { property: "og:title", content: "Conciliação Financeira — Hublynx Core" },
      {
        property: "og:description",
        content: "PASSA ou FALHA em cada regra do financeiro, com os valores envolvidos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConciliacaoPage,
});

function ConciliacaoPage() {
  const search = Route.useSearch() as { month?: number; year?: number };
  const month = search.month ?? new Date().getMonth() + 1;
  const year = search.year ?? new Date().getFullYear();

  const fn = useServerFn(getReconciliation);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["finance", "conciliacao", month, year],
    queryFn: () => fn({ data: { month, year } }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Conciliação</h2>
          <p className="text-sm text-muted-foreground">
            Testes executados ao vivo sobre os dados reais · competência{" "}
            {formatCompetenciaBR(data?.competencia ?? `${year}-${String(month).padStart(2, "0")}`)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                {data.passou} passa
              </span>
              <span
                className={`rounded px-2 py-1 font-medium ${
                  data.falhou ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {data.falhou} falha
              </span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Rodar novamente
          </Button>
        </div>
      </div>

      {!data ? (
        <Card className="p-6 text-sm text-muted-foreground">Rodando testes…</Card>
      ) : (
        <div className="space-y-3">
          {data.testes.map((t) => {
            const ok = t.status === "passa";
            return (
              <Card
                key={t.id}
                className="overflow-hidden"
                style={{ borderTop: `3px solid ${ok ? "#22C55E" : "#EF4444"}` }}
              >
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                          ok ? "bg-emerald-500" : "bg-red-500"
                        } text-white`}
                      >
                        {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      </span>
                      <span className="text-[12.2px] font-mono text-muted-foreground">
                        Teste {t.id}
                      </span>
                      <span className="font-medium">{t.titulo}</span>
                    </div>
                    <p className="mt-1 text-[12.2px] text-muted-foreground">{t.descricao}</p>
                    <p className="mt-1 text-[12.2px] text-muted-foreground">{t.detalhe}</p>
                    {!ok && t.critico && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded bg-red-50 px-2 py-1 text-[12.2px] font-medium text-red-700">
                        <TriangleAlert className="h-3.5 w-3.5" />
                        {t.critico}
                      </p>
                    )}
                  </div>
                  <div
                    className={`shrink-0 rounded px-2 py-1 text-sm font-semibold ${
                      ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {ok ? "PASSA" : "FALHA"}
                  </div>
                </div>

                <div className="border-t bg-[#F6F8FA] px-4 py-3">
                  <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {t.linhas.map((l) => (
                      <div key={l.label} className="flex items-baseline justify-between gap-3">
                        <span className="text-[12.2px] text-muted-foreground">{l.label}</span>
                        {typeof l.value === "number" && !Number.isInteger(l.value * 100) === false && l.label.toLowerCase().match(/quantidade|títulos|repasses|contas|linha[s]? |sem espelho/) ? (
                          <span className="font-mono text-[14.5px] tabular-nums">{l.value}</span>
                        ) : typeof l.value === "number" ? (
                          <Money value={l.value} className="text-[14.5px]" />
                        ) : (
                          <span className="text-[14.5px]">{l.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {!ok && t.diferenca !== null && (
                    <div className="mt-2 flex items-baseline justify-between gap-3 border-t pt-2">
                      <span className="text-[12.2px] font-medium text-red-700">Diferença</span>
                      <Money value={t.diferenca} className="text-[14.5px] font-semibold text-red-600" />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
