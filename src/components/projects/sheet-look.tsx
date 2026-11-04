import { calcValue, toNumber, validityState, type CostColumn, type CostColumnType } from "@/lib/projects/cost-presets";
import { cn } from "@/lib/utils";

/**
 * Aparência das planilhas do Comercial — fonte única para a equipe (Core) e o cliente (portal),
 * para a planilha liberada aparecer exatamente como a equipe deixou: cores de linha/célula,
 * larguras, cabeçalho, coluna de total destacada, chips de situação e validade, rodapé.
 */

/** Cores de destaque das linhas/células (guardadas na própria linha: "__cor" e "__cor:<coluna>"). */
export const CELL_COLORS: { id: string; label: string; cls: string; dot: string }[] = [
  { id: "amarelo", label: "Amarelo", cls: "bg-amber-100 dark:bg-amber-500/20", dot: "bg-amber-300" },
  { id: "laranja", label: "Laranja", cls: "bg-orange-100 dark:bg-orange-500/20", dot: "bg-orange-400" },
  { id: "vermelho", label: "Vermelho", cls: "bg-rose-100 dark:bg-rose-500/20", dot: "bg-rose-400" },
  { id: "azul", label: "Azul", cls: "bg-sky-100 dark:bg-sky-500/20", dot: "bg-sky-400" },
  { id: "verde", label: "Verde", cls: "bg-emerald-100 dark:bg-emerald-500/20", dot: "bg-emerald-400" },
  { id: "roxo", label: "Roxo", cls: "bg-violet-100 dark:bg-violet-500/20", dot: "bg-violet-400" },
  { id: "cinza", label: "Cinza", cls: "bg-slate-200 dark:bg-slate-500/25", dot: "bg-slate-400" },
];
export const ROW_COLOR = "__cor";
export const cellColorKey = (k: string) => `__cor:${k}`;
export const colorCls = (id: unknown) => CELL_COLORS.find((c) => c.id === id)?.cls;
/** Fundo da célula: cor da célula vence a cor da linha. */
export const cellBg = (data: Record<string, unknown>, key: string) => colorCls(data[cellColorKey(key)]) ?? colorCls(data[ROW_COLOR]);

export const VALIDITY_TONE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
  action: "bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-200",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200",
  late: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-200",
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const maskBRL = (n: number | null | undefined) => BRL.format(Number(n ?? 0));

export function fmtNumber(n: number | null, type: CostColumnType | "calc-percent") {
  if (n === null) return "";
  if (type === "currency") return maskBRL(n);
  if (type === "percent" || type === "calc-percent") return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Formato de uma coluna calculada / total. */
export const calcFormat = (c: CostColumn): CostColumnType | "calc-percent" =>
  c.type === "calc" ? (c.calc?.asPercent ? "calc-percent" : c.calc?.asCurrency ? "currency" : "number") : c.type;

export const isNumericCol = (c: CostColumn) => ["currency", "number", "percent", "calc"].includes(c.type);

/** Largura padrão (a equipe pode ajustar e grava em columns[].width). */
export const baseWidth = (c: CostColumn) =>
  c.width ?? (c.type === "text" ? 180 : c.type === "validity" ? 130 : c.type === "date" ? 140 : 120);

export function rowIsResolved(columns: CostColumn[], data: Record<string, unknown>) {
  return columns.some((c) => c.type === "status" && c.options?.some((o) => o.done && o.label === data[c.key]));
}

export function StatusChip({ column, value }: { column: CostColumn; value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const o = column.options?.find((x) => x.label === value);
  const color = o?.color ?? "#64748b";
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${color}1f`, color }}>
      {value}
    </span>
  );
}

export function ValidityChip({ value }: { value: unknown }) {
  const st = validityState(value);
  if (!st) return null;
  return (
    <span
      className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", VALIDITY_TONE[st.tone])}
      title={st.days > 0 ? `Faltam ${st.days} dia(s)` : st.days === 0 ? "Vence hoje" : `Venceu há ${-st.days} dia(s)`}
    >
      {st.label}
    </span>
  );
}

export function ValidityLegend() {
  return (
    <div className="flex flex-wrap gap-2">
      {[
        ["ok", "Válido · mais de 180 dias"],
        ["warn", "Atenção · até 180 dias"],
        ["action", "Ação · até 90 dias"],
        ["info", "Informativo · até 45 dias"],
        ["late", "Vencido"],
      ].map(([t, l]) => (
        <span key={t} className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", VALIDITY_TONE[t])}>
          {l}
        </span>
      ))}
    </div>
  );
}

const fmtDate = (v: unknown) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "");

/** Valor de uma célula só para leitura (igual à equipe quando não edita). */
export function ReadOnlyCell({ c, data, columns }: { c: CostColumn; data: Record<string, unknown>; columns: CostColumn[] }) {
  const v = data[c.key];
  if (c.type === "validity") return <ValidityChip value={c.validity ? data[c.validity.ref] : null} />;
  if (c.type === "calc") return <>{fmtNumber(calcValue(c, data, columns), calcFormat(c))}</>;
  if (c.type === "status") return <StatusChip column={c} value={v as string} />;
  if (c.type === "currency" || c.type === "number" || c.type === "percent") return <>{fmtNumber(toNumber(v), c.type)}</>;
  if (c.type === "date") return <>{fmtDate(v)}</>;
  if (c.type === "boolean") return <>{v === true || v === "true" ? "Sim" : v === false || v === "false" ? "Não" : ""}</>;
  return <>{v === null || v === undefined ? "" : String(v)}</>;
}

/**
 * Planilha só para ver, com a mesma aparência da equipe (usada no portal do cliente).
 * Respeita as cores de linha/célula, larguras das colunas, coluna de total e alertas de data.
 */
export function SheetReadOnlyTable({ columns, rows, emptyText = "Nenhum item lançado ainda." }: {
  columns: CostColumn[];
  rows: { id: string; data: Record<string, unknown> }[];
  emptyText?: string;
}) {
  const cols = columns.filter((c) => !c.key.startsWith("__"));
  const totals: Record<string, number> = {};
  for (const c of cols) {
    if (!c.sum) continue;
    totals[c.key] = rows.reduce((a, r) => a + ((c.type === "calc" ? calcValue(c, r.data, cols) : toNumber(r.data[c.key])) ?? 0), 0);
  }
  const hasTotals = cols.some((c) => c.sum);
  const tableWidth = 44 + cols.reduce((a, c) => a + baseWidth(c), 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-[0_1px_2px_rgba(10,23,60,.06),0_10px_28px_rgba(10,23,60,.06)]">
      <table className="table-fixed border-collapse text-sm" style={{ width: tableWidth, minWidth: "100%" }}>
        <colgroup>
          <col style={{ width: 44 }} />
          {cols.map((c) => <col key={c.key} style={{ width: baseWidth(c) }} />)}
        </colgroup>
        <thead className="bg-[var(--brand-dark,var(--brand-ink,#0a2557))] text-white">
          <tr>
            <th className="px-2 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide">Item</th>
            {cols.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-2 py-2 align-middle text-[11px] font-bold uppercase leading-tight tracking-wide",
                  isNumericCol(c) ? "text-right" : "text-left",
                  c.type === "calc" && c.sum && "bg-primary text-primary-foreground",
                )}
              >
                <span className="line-clamp-2 block break-words" title={c.label}>{c.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length + 1} className="px-3 py-6 text-center text-muted-foreground">{emptyText}</td>
            </tr>
          )}
          {rows.map((r, i) => {
            const resolved = rowIsResolved(cols, r.data);
            return (
              <tr key={r.id} className="border-t align-middle">
                <td className={cn("px-2 py-1.5 text-xs text-muted-foreground tabular-nums", colorCls(r.data[ROW_COLOR]))}>{i + 1}</td>
                {cols.map((c) => {
                  const v = r.data[c.key];
                  const overdue = c.type === "date" && !!c.alert && !!v && !resolved && new Date(`${String(v).slice(0, 10)}T12:00:00`) < today;
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        "px-2 py-1.5",
                        isNumericCol(c) && "text-right tabular-nums",
                        c.type === "calc" && (c.sum ? "bg-primary/10 font-bold text-foreground" : "text-muted-foreground"),
                        overdue && "bg-rose-50 font-medium text-rose-700 dark:bg-rose-500/10",
                        // cor definida pela equipe (célula, senão a linha) — vem por último para valer
                        cellBg(r.data, c.key),
                      )}
                    >
                      <ReadOnlyCell c={c} data={r.data} columns={cols} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {hasTotals && rows.length > 0 && (
          <tfoot className="bg-muted/60 font-extrabold">
            <tr className="border-t-2">
              <td className="whitespace-nowrap px-2 py-2.5 text-xs">Total</td>
              {cols.map((c) => (
                <td key={c.key} className={cn("px-2 py-2.5 text-right tabular-nums", c.type === "calc" && c.sum && "bg-primary/20")}>
                  {c.sum ? fmtNumber(totals[c.key] ?? 0, calcFormat(c)) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
