import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Money } from "@/components/finance/Money";
import { getRevenueComposition } from "@/lib/finance/servicos.functions";

/** Barra horizontal de composição da receita do mês por linha de serviço. */
export function RevenueMixBar({ month, year }: { month: number; year: number }) {
  const fn = useServerFn(getRevenueComposition);
  const { data } = useQuery({
    queryKey: ["finance", "revenue-mix", month, year],
    queryFn: () => fn({ data: { month, year } }),
  });

  const parts = data?.parts ?? [];

  return (
    <Card className="rounded-[14px] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Composição da receita por linha de serviço
        </p>
        <span className="font-mono text-[14.5px] font-semibold tabular-nums">
          <Money value={data?.total ?? 0} zeroDash={false} />
        </span>
      </div>

      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) => (
          <div
            key={p.id ?? "none"}
            className="h-full"
            style={{ width: `${p.pct}%`, backgroundColor: p.cor }}
            title={`${p.nome} — ${p.pct.toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {parts.map((p) => (
          <div key={p.id ?? "none"} className="flex items-center gap-1.5 text-[12.2px]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.cor }} />
            <span className="text-muted-foreground">{p.nome}</span>
            <span className="font-mono tabular-nums">{p.pct.toFixed(1).replace(".", ",")}%</span>
            <Money value={p.valor} className="text-muted-foreground" />
          </div>
        ))}
        {parts.length === 0 && (
          <p className="text-[12.2px] text-muted-foreground">Sem receita no mês selecionado.</p>
        )}
      </div>
    </Card>
  );
}
