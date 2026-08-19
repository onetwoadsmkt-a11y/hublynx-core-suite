import { Card } from "@/components/ui/card";
import { Money, RegimeBadge } from "@/components/finance/Money";

export function ProfitHeroCard({
  lucro,
  receita,
  despesas,
  margem,
}: {
  lucro: number;
  receita: number;
  despesas: number;
  margem: number | null | undefined;
}) {
  const negative = lucro < 0;
  const margemTxt =
    margem === null || margem === undefined || receita === 0
      ? "—"
      : `${margem.toFixed(1).replace(".", ",")}%`;

  return (
    <Card
      className="relative col-span-2 overflow-hidden rounded-[14px] p-5"
      style={{ borderTop: `3px solid ${negative ? "#DC2626" : "#22C55E"}` }}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lucro do mês</p>
      <p
        className={`mt-1 font-mono font-semibold leading-none ${negative ? "text-red-600" : "text-[#16A34A]"}`}
        style={{ fontSize: 42, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}
      >
        <Money value={lucro} zeroDash={false} className="font-semibold" />
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.2px] text-muted-foreground">
        <RegimeBadge regime="competencia" />
        <span>
          Receita <Money value={receita} zeroDash={false} className="text-foreground" /> − despesas{" "}
          <Money value={despesas} zeroDash={false} className="text-foreground" /> · margem{" "}
          <span className="font-mono tabular-nums text-foreground">{margemTxt}</span>
        </span>
      </div>
    </Card>
  );
}
