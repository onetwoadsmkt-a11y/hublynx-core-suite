import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Money } from "@/components/finance/Money";
import { getReceivablesPanel } from "@/lib/finance/receivables.functions";
import { getFinanceMetricsSeries } from "@/lib/finance/metrics.functions";

export const Route = createFileRoute("/_authenticated/financeiro/recebiveis")({
  head: () => ({
    meta: [
      { title: "Painel de Recebíveis — Hublynx Core" },
      {
        name: "description",
        content:
          "Recebíveis por cliente e projeto, mês a mês, com previsto, recebido e valores em aberto.",
      },
      { property: "og:title", content: "Painel de Recebíveis — Hublynx Core" },
      {
        property: "og:description",
        content: "Controle financeiro por cliente e projeto, com acompanhamento mensal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecebiveisPage,
});

function pct(a: number, b: number) {
  return b > 0 ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—";
}
function Cell({ v, className = "" }: { v: number; className?: string }) {
  return <Money value={v} className={className} />;
}

function RecebiveisPage() {
  const now = new Date();
  const [startYear, setStartYear] = useState(now.getFullYear());
  const [startMonth, setStartMonth] = useState(1);
  const [kind, setKind] = useState<"receber" | "pagar">("receber");
  const [search, setSearch] = useState("");

  const fn = useServerFn(getReceivablesPanel);
  const { data, isLoading } = useQuery({
    queryKey: ["finance", "receivables", startYear, startMonth, kind],
    queryFn: () => fn({ data: { startYear, startMonth, months: 12, kind } }),
  });

  const seriesFn = useServerFn(getFinanceMetricsSeries);
  const { data: serie } = useQuery({
    queryKey: ["finance", "metrics-series", startYear, startMonth, 12],
    queryFn: () => seriesFn({ data: { startMonth, startYear, months: 12 } }),
  });

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) => r.client.toLowerCase().includes(q) || r.project.toLowerCase().includes(q),
    );
  }, [data, search]);

  const positive = kind === "receber";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setStartYear((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-16 text-center text-sm font-semibold">{startYear}</span>
          <Button variant="outline" size="icon" onClick={() => setStartYear((y) => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <select
          value={startMonth}
          onChange={(e) => setStartMonth(Number(e.target.value))}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              Início: {new Date(2000, i, 1).toLocaleDateString("pt-BR", { month: "long" })}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "receber" | "pagar")}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="receber">Recebíveis</option>
          <option value="pagar">Despesas</option>
        </select>
        <Input
          placeholder="Filtrar cliente ou projeto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-64"
        />
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
          Previsto por projeto
        </h2>
        <p className="text-xs text-muted-foreground">
          Valores por competência (data de vencimento), agrupados por cliente e projeto.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/60">
                <th className="sticky left-0 z-10 bg-muted/60 px-2 py-2 text-left font-semibold">
                  Cliente
                </th>
                <th className="px-2 py-2 text-left font-semibold">Projeto / Serviço</th>
                {(data?.labels ?? []).map((l) => (
                  <th key={l} className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                    {l}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b hover:bg-muted/40">
                  <td className="sticky left-0 z-10 bg-background px-2 py-1.5 font-medium">
                    {r.client}
                  </td>
                  <td className="px-2 py-1.5 text-[12.2px] text-muted-foreground">{r.project}</td>
                  {r.months.map((v, i) => (
                    <td
                      key={i}
                      className={`px-2 py-1.5 text-right tabular-nums ${
                        (r.received[i] ?? 0) > 0 ? "text-emerald-600" : ""
                      }`}
                    >
                      <Cell v={v} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right text-[14.5px] font-semibold">
                    <Money value={r.total} zeroDash={false} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={(data?.labels.length ?? 12) + 3} className="py-6 text-center text-muted-foreground">
                    {isLoading ? "Carregando..." : "Nenhum lançamento no período."}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-primary/10 font-semibold">
                <td className="sticky left-0 z-10 bg-primary/10 px-2 py-2">
                  {positive ? "Total previsto" : "Total despesas"}
                </td>
                <td />
                {(data?.previsto ?? []).map((v, i) => (
                  <td key={i} className="px-2 py-2 text-right tabular-nums">
                    <Cell v={v} />
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums"><Money value={data?.totalPrevisto ?? 0} zeroDash={false} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
          Acompanhamento mensal
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/60">
                <th className="sticky left-0 z-10 bg-muted/60 px-2 py-2 text-left font-semibold">
                  Indicador
                </th>
                {(serie?.labels ?? data?.labels ?? []).map((l) => (
                  <th key={l} className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                    {l}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="sticky left-0 z-10 bg-background px-2 py-1.5 font-medium">
                  {positive ? "Receita (competência)" : "Despesas (competência)"}
                </td>
                {(serie?.[positive ? "receita" : "despesas"] ?? []).map((v, i) => (
                  <td key={i} className="px-2 py-1.5 text-right tabular-nums"><Cell v={v} /></td>
                ))}
                <td className="px-2 py-1.5 text-right text-[14.5px] font-semibold">
                  <Money value={serie?.totals[positive ? "receita" : "despesas"] ?? 0} zeroDash={false} />
                </td>
              </tr>
              <tr className="border-b">
                <td className="sticky left-0 z-10 bg-background px-2 py-1.5 font-medium">
                  {positive ? "Recebido (caixa)" : "Pago (caixa)"}
                </td>
                {(serie?.recebido ?? []).map((v, i) => (
                  <td key={i} className="px-2 py-1.5 text-right tabular-nums text-emerald-600"><Cell v={v} /></td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-emerald-600">
                  <Money value={serie?.totals.recebido ?? 0} zeroDash={false} />
                </td>
              </tr>
              <tr className="border-b">
                <td className="sticky left-0 z-10 bg-background px-2 py-1.5 font-medium">Em aberto</td>
                {(serie?.aberto ?? []).map((v, i) => (
                  <td key={i} className="px-2 py-1.5 text-right tabular-nums text-amber-600"><Cell v={v} /></td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-amber-600">
                  <Money value={serie?.totals.aberto ?? 0} zeroDash={false} />
                </td>
              </tr>
              <tr className="border-b">
                <td className="sticky left-0 z-10 bg-background px-2 py-1.5 font-medium">% concluído</td>
                {(serie?.receita ?? []).map((v, i) => (
                  <td key={i} className="px-2 py-1.5 text-right tabular-nums">
                    {v > 0 ? pct(serie?.recebido[i] ?? 0, v) : "—"}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right text-[14.5px] font-semibold">
                  {(serie?.totals.receita ?? 0) > 0
                    ? pct(serie?.totals.recebido ?? 0, serie?.totals.receita ?? 0)
                    : "—"}
                </td>
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-background px-2 py-1.5 font-medium">Lançamentos</td>
                {(data?.count ?? []).map((v, i) => (
                  <td key={i} className="px-2 py-1.5 text-right tabular-nums">{v || "–"}</td>
                ))}
                <td className="px-2 py-1.5 text-right text-[14.5px] font-semibold">
                  {(data?.count ?? []).reduce((a, b) => a + b, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
