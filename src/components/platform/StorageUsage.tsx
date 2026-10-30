import { cn } from "@/lib/utils";
import {
  fmtMB,
  fmtPrice,
  orgLimits,
  suggestPackage,
  usageLevel,
  type StoragePackage,
} from "@/lib/platform/storage-plans";

const BAR: Record<string, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", over: "bg-rose-600" };
const TXT: Record<string, string> = { ok: "text-muted-foreground", warn: "text-amber-700 font-semibold", over: "text-rose-700 font-bold" };

export function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const level = usageLevel(used, limit);
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("tabular-nums text-xs", TXT[level])}>
          {fmtMB(used)} de {fmtMB(limit)} · {pct}%{level === "over" ? " · acima do limite" : level === "warn" ? " · perto do limite" : ""}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full", BAR[level])} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

/** Uso de banco e arquivos da empresa frente ao Plano Core + pacote extra. */
export function OrgUsageSummary({
  packages,
  extraCode,
  database_mb,
  storage_mb,
}: {
  packages: StoragePackage[];
  extraCode: string | null;
  database_mb: number;
  storage_mb: number;
}) {
  const lim = orgLimits(packages, extraCode);
  const sug = suggestPackage(packages, { database_mb, storage_mb });
  const needsMore = sug && (!lim.extra || sug.sort_order > lim.extra.sort_order);
  return (
    <div className="space-y-3">
      <UsageBar label="Banco de dados" used={database_mb} limit={lim.database_mb} />
      <UsageBar label="Arquivos (anexos e planilhas)" used={storage_mb} limit={lim.storage_mb} />
      {needsMore && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          O uso está chegando ao limite. Pacote indicado: <strong>{sug!.name}</strong> (+{fmtMB(sug!.database_mb)} de banco e +
          {fmtMB(sug!.storage_mb)} de arquivos).
        </p>
      )}
    </div>
  );
}

/** Tabela do plano e da escala de pacotes (valores ocultos por enquanto). */
export function PackagesTable({ packages, current }: { packages: StoragePackage[]; current?: string | null }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-[var(--brand-dark,#0a2557)] text-left text-[11px] font-bold uppercase tracking-wide text-white">
          <tr>
            <th className="px-3 py-2.5">Plano / pacote</th>
            <th className="px-3 py-2.5 text-right">Banco de dados</th>
            <th className="px-3 py-2.5 text-right">Arquivos</th>
            <th className="px-3 py-2.5 text-right">Mensalidade</th>
          </tr>
        </thead>
        <tbody>
          {packages.map((p) => {
            const active = p.is_base ? true : current === p.code;
            return (
              <tr key={p.code} className={cn("border-t", active && "bg-primary/10")}>
                <td className="px-3 py-2.5 font-semibold">
                  {p.name}
                  {p.is_base && <span className="ml-2 text-xs font-normal text-muted-foreground">incluído</span>}
                  {!p.is_base && current === p.code && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">contratado</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.is_base ? "" : "+"}{fmtMB(p.database_mb)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.is_base ? "" : "+"}{fmtMB(p.storage_mb)}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtPrice(p.monthly_price)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
