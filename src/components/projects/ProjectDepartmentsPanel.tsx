import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Columns3,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { maskBRL } from "@/lib/security/value-lock";
import {
  BLANK_SHEET,
  COLUMN_TYPE_LABEL,
  DEPARTMENT_PRESETS,
  STATUS_COLORS,
  calcValue,
  validityState,
  slugKey,
  toNumber,
  type CostColumn,
  type CostColumnType,
  type SheetInfo,
} from "@/lib/projects/cost-presets";
import {
  createDepartment,
  deleteDepartment,
  deleteRow,
  deleteSheet,
  importSheet,
  listProjectDepartments,
  replaceSheetFromImport,
  saveSheetInfo,
  loadTemplateDepartments,
  saveDepartmentsToTemplate,
  saveRow,
  saveSheet,
  updateDepartment,
  type CostDepartment,
  type CostRow,
  type CostSheet,
} from "@/lib/projects/costs.functions";
import {
  buildImportedSheet,
  IMPORT_MAX_ROWS,
  type ImportCell,
  type ImportedSheet,
  type ImportOptions,
} from "@/lib/projects/sheet-import";
import { exprLabel } from "@/lib/projects/sheet-formula";

/** CSV salvo pelo Excel no Brasil costuma vir em Windows-1252: usa UTF-8 e cai para ele se houver caracteres inválidos. */
function decodeCsv(buf: ArrayBuffer) {
  const utf = new TextDecoder("utf-8").decode(buf);
  return utf.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(buf) : utf;
}

type ReadSheet = { name: string; grid: ImportCell[][]; opts: ImportOptions };

/** Lê o arquivo no navegador: valores, fórmulas e formatos de cada célula, por aba. */
async function readWorkbook(file: File): Promise<{ base: string; sheets: ReadSheet[] }> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const isCsv = /\.(csv|txt)$/i.test(file.name);
  const wb = isCsv
    ? XLSX.read(decodeCsv(buf), { type: "string", raw: true })
    : XLSX.read(buf, { type: "array", cellDates: true, cellFormula: true, cellNF: true });
  const base = file.name.replace(/\.[^.]+$/, "");
  const sheets = wb.SheetNames.map((n) => {
    const ws = wb.Sheets[n];
    if (!ws || !ws["!ref"]) return { name: n, grid: [], opts: {} };
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const lastRow = Math.min(range.e.r, range.s.r + 5000);
    const lastCol = Math.min(range.e.c, range.s.c + 80);
    const grid: ImportCell[][] = [];
    const formulas: (string | undefined)[][] = [];
    const formats: (string | undefined)[][] = [];
    for (let r = range.s.r; r <= lastRow; r++) {
      const vr: ImportCell[] = [];
      const fr: (string | undefined)[] = [];
      const zr: (string | undefined)[] = [];
      for (let c = range.s.c; c <= lastCol; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as { v?: unknown; f?: string; z?: string; t?: string } | undefined;
        const v = cell?.v;
        vr.push(v === undefined || cell?.t === "e" ? null : (v as ImportCell));
        fr.push(cell?.f);
        zr.push(typeof cell?.z === "string" ? cell.z : undefined);
      }
      grid.push(vr);
      formulas.push(fr);
      formats.push(zr);
    }
    return { name: n, grid, opts: { formulas, formats, firstRow: range.s.r + 1, firstCol: range.s.c } };
  });
  return { base, sheets };
}

/** Lê um arquivo Excel/CSV no navegador e cria uma aba por planilha não vazia. */
function useSheetImport(queryKey: unknown[], onDone?: (sheetId: string) => void) {
  const qc = useQueryClient();
  const importFn = useServerFn(importSheet);
  const createFn = useServerFn(createDepartment);
  const [busy, setBusy] = useState(false);
  async function run(file: File, target: { departmentId: string } | { projectId: string }) {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 15 MB).");
      return;
    }
    setBusy(true);
    try {
      const { base, sheets } = await readWorkbook(file);
      const parsed = sheets
        .map((sh) => buildImportedSheet(sheets.length === 1 ? base : sh.name, sh.grid, sh.opts))
        .filter((x): x is NonNullable<typeof x> => !!x && x.rows.length > 0);
      if (!parsed.length) {
        toast.error("Não encontrei linhas com dados nesse arquivo.");
        return;
      }
      let departmentId = "departmentId" in target ? target.departmentId : "";
      if (!departmentId) {
        const d = await createFn({ data: { projectId: (target as { projectId: string }).projectId, name: "Planilhas", color: "#2563eb", empty: true } });
        departmentId = (d as { id: string }).id;
      }
      let last = "";
      let total = 0;
      let skipped = 0;
      let infoLost = false;
      for (const sh of parsed) {
        const r = await importFn({ data: { departmentId, name: sh.name, columns: sh.columns, rows: sh.rows, info: sh.info } });
        if (!r.infoSaved) infoLost = true;
        last = r.id;
        total += r.rows;
        skipped += sh.skippedRows;
      }
      toast.success(
        `${parsed.length} planilha(s) importada(s) com ${total} linha(s).` +
          (skipped ? ` ${skipped} linha(s) acima do limite de ${IMPORT_MAX_ROWS} ficaram de fora.` : ""),
      );
      if (infoLost) toast.warning("Cabeçalho e resumo da planilha não foram guardados: rode a migração 26 no banco.");
      await qc.invalidateQueries({ queryKey });
      onDone?.(last);
    } catch (e) {
      toast.error(`Não foi possível importar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  return { run, busy };
}

const TYPE_TEXT: Record<string, string> = { ...COLUMN_TYPE_LABEL, calc: "Cálculo" };

/**
 * Importa um arquivo DENTRO da aba aberta (ex.: "Itens comprados"): as colunas se organizam
 * pelo arquivo (tipos, totais e fórmulas viram colunas calculadas) e a pessoa confere antes.
 */
function ImportIntoSheet({ sheet, queryKey }: { sheet: CostSheet; queryKey: unknown[] }) {
  const qc = useQueryClient();
  const replaceFn = useServerFn(replaceSheetFromImport);
  const ref = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<{ file: string; sheetName: string; data: ImportedSheet } | null>(null);
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const save = useMutation({
    mutationFn: () =>
      replaceFn({ data: { sheetId: sheet.id, columns: preview!.data.columns, rows: preview!.data.rows, mode, info: preview!.data.info } }),
    onSuccess: (r) => {
      toast.success(`Planilha "${sheet.name}" atualizada: ${r.rows} linha(s) importada(s).`);
      if (!r.infoSaved) toast.warning("Cabeçalho e resumo da planilha não foram guardados: rode a migração 26 no banco.");
      setPreview(null);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 15 MB).");
      return;
    }
    setReading(true);
    try {
      const { base, sheets } = await readWorkbook(file);
      const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const built = sheets
        .map((sh) => ({ sh, data: buildImportedSheet(sheet.name, sh.grid, { ...sh.opts, existing: sheet.columns }) }))
        .filter((x) => x.data && x.data.rows.length > 0) as { sh: ReadSheet; data: ImportedSheet }[];
      if (!built.length) {
        toast.error("Não encontrei linhas com dados nesse arquivo.");
        return;
      }
      // aba com o mesmo nome; senão a que tem mais linhas
      const pick =
        built.find((b) => norm(b.sh.name) === norm(sheet.name)) ??
        [...built].sort((a, b) => b.data.rows.length - a.data.rows.length)[0];
      setMode("replace");
      setPreview({ file: base, sheetName: pick.sh.name, data: pick.data });
    } catch (e) {
      toast.error(`Não foi possível ler o arquivo: ${(e as Error).message}`);
    } finally {
      setReading(false);
    }
  }

  const cols = preview?.data.columns ?? [];
  const labelOf = (k: string) => cols.find((c) => c.key === k)?.label ?? k;
  const sample = preview?.data.rows.slice(0, 5) ?? [];
  const fmt = (c: CostColumn, row: Record<string, unknown>): React.ReactNode => {
    if (c.type === "validity") return <ValidityChip value={c.validity ? row[c.validity.ref] : null} />;
    if (c.type === "calc") {
      const n = calcValue(c, row, cols);
      return fmtNumber(n, c.calc?.asPercent ? "calc-percent" : c.calc?.asCurrency ? "currency" : "number");
    }
    const v = row[c.key];
    if (v === null || v === undefined || v === "") return "";
    if (c.type === "currency" || c.type === "number" || c.type === "percent") return fmtNumber(toNumber(v), c.type);
    if (c.type === "boolean") return v ? "Sim" : "Não";
    if (c.type === "date" && typeof v === "string") return v.split("-").reverse().join("/");
    return String(v);
  };
  const totals = cols
    .filter((c) => c.sum)
    .map((c) => ({
      c,
      v: (preview?.data.rows ?? []).reduce<number>((acc, r) => acc + ((c.type === "calc" ? calcValue(c, r, cols) : toNumber(r[c.key])) ?? 0), 0),
    }));

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      <Button size="sm" className="h-8 font-bold" disabled={reading} onClick={() => ref.current?.click()} title={`Importar um Excel/CSV para dentro de "${sheet.name}"`}>
        {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Importar planilha nesta aba
      </Button>
      <Dialog open={!!preview} onOpenChange={(v) => !v && !save.isPending && setPreview(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar para "{sheet.name}"</DialogTitle>
            <DialogDescription>
              {preview && (
                <>
                  Arquivo <strong>{preview.file}</strong>, aba <strong>{preview.sheetName}</strong>: {preview.data.rows.length} linha(s) e{" "}
                  {cols.length} coluna(s). Confira como as colunas foram organizadas antes de salvar.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border">
                <div className="grid grid-cols-[minmax(0,1.3fr)_140px_minmax(0,2fr)] gap-3 bg-muted/60 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span>Coluna</span>
                  <span>Tipo</span>
                  <span>Cálculo / total</span>
                </div>
                {cols.map((c) => (
                  <div key={c.key} className="grid grid-cols-[minmax(0,1.3fr)_140px_minmax(0,2fr)] items-center gap-3 border-t px-3 py-2 text-sm">
                    <span className="truncate font-medium" title={c.label}>{c.label}</span>
                    <span className={cn("w-fit rounded-full px-2 py-0.5 text-xs font-semibold", c.type === "calc" || c.type === "validity" ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground")}>
                      {c.type === "calc" ? (c.calc?.asCurrency ? "Cálculo (R$)" : c.calc?.asPercent ? "Cálculo (%)" : "Cálculo") : TYPE_TEXT[c.type] ?? c.type}
                    </span>
                    <span className="truncate text-xs text-muted-foreground" title={c.calc?.expr ? exprLabel(c.calc.expr, labelOf) : undefined}>
                      {c.calc?.expr ? `= ${exprLabel(c.calc.expr, labelOf)}` : ""}
                      {c.validity ? `pela data de ${labelOf(c.validity.ref)}` : ""}
                      {c.sum ? `${c.calc?.expr ? " · " : ""}soma no rodapé` : ""}
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Primeiras linhas, já calculadas pelo Core</p>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-max text-sm">
                    <thead className="bg-muted/60">
                      <tr>{cols.map((c) => <th key={c.key} className="px-2 py-1.5 text-left text-xs font-semibold">{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {sample.map((r, i) => (
                        <tr key={i} className="border-t">
                          {cols.map((c) => (
                            <td key={c.key} className={cn("px-2 py-1.5", c.type === "calc" && "font-semibold")}>{fmt(c, r)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {totals.length > 0 && (
                      <tfoot className="bg-muted/40 font-bold">
                        <tr className="border-t">
                          {cols.map((c) => {
                            const t = totals.find((x) => x.c.key === c.key);
                            return (
                              <td key={c.key} className="px-2 py-1.5">
                                {t ? fmtNumber(t.v, c.type === "calc" ? (c.calc?.asPercent ? "calc-percent" : c.calc?.asCurrency ? "currency" : "number") : c.type) : ""}
                              </td>
                            );
                          })}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                {preview.data.rows.length > 5 && (
                  <p className="mt-1 text-xs text-muted-foreground">Totais calculados sobre as {preview.data.rows.length} linhas.</p>
                )}
              </div>

              {(() => {
                const inf = preview.data.info;
                const has = (inf.fields?.length ?? 0) + (inf.adjustments?.length ?? 0) + (inf.notes?.length ?? 0) > 0;
                if (!has) return null;
                return (
                  <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 text-sm sm:grid-cols-3">
                    {!!inf.fields?.length && (
                      <div>
                        <p className="mb-1 text-xs font-bold text-muted-foreground">Cabeçalho {inf.title ? `· ${inf.title}` : ""}</p>
                        {inf.fields.map((f) => (
                          <p key={f.key} className="truncate"><span className="text-muted-foreground">{f.label}:</span> {f.value || "—"}</p>
                        ))}
                      </div>
                    )}
                    {!!inf.adjustments?.length && (
                      <div>
                        <p className="mb-1 text-xs font-bold text-muted-foreground">Somados ao total</p>
                        {inf.adjustments.map((a) => (
                          <p key={a.key} className="truncate">+ {a.label}{a.note ? ` (${a.note})` : ""}: {a.value === null ? "—" : maskBRL(a.value)}</p>
                        ))}
                      </div>
                    )}
                    {!!inf.notes?.length && (
                      <div>
                        <p className="mb-1 text-xs font-bold text-muted-foreground">Observações</p>
                        {inf.notes.map((n, i) => (
                          <p key={i} className="line-clamp-2">{n.label ? <span className="text-muted-foreground">{n.label}: </span> : null}{n.value}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              {sheet.rows.length > 0 && (
                <div role="radiogroup" aria-label="O que fazer com os lançamentos atuais" className="grid gap-2 sm:grid-cols-2">
                  {([
                    ["replace", "Substituir", `Apaga os ${sheet.rows.length} lançamento(s) atuais e usa só os do arquivo.`],
                    ["append", "Somar", "Mantém os lançamentos atuais e acrescenta os do arquivo no fim."],
                  ] as const).map(([v, t, d]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={mode === v}
                      onClick={() => setMode(v)}
                      className={cn("rounded-xl border p-3 text-left", mode === v ? "border-primary bg-primary/10" : "hover:bg-muted/50")}
                    >
                      <span className="block text-sm font-bold">{t}</span>
                      <span className="block text-xs text-muted-foreground">{d}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                As colunas da aba passam a ser as do arquivo. Colunas com o mesmo nome mantêm seus ajustes. Fórmulas que o
                Core não reconhece (SE, PROCV, outras abas) entram como valor fixo.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={save.isPending} onClick={() => setPreview(null)}>
              Cancelar
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const IMPORT_ACCEPT = ".xlsx,.xls,.xlsm,.ods,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";

function ImportSheetButton({
  busy,
  onFile,
  label = "Importar planilha",
  className,
}: {
  busy: boolean;
  onFile: (f: File) => void;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      <Button size="sm" variant="outline" className={className} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        {busy ? "Importando…" : label}
      </Button>
    </>
  );
}

const DEPT_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#64748b",
];

function fmtNumber(n: number | null, type: CostColumnType | "calc-percent") {
  if (n === null) return "";
  if (type === "currency") return maskBRL(n);
  if (type === "percent" || type === "calc-percent")
    return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function rowIsResolved(columns: CostColumn[], data: Record<string, unknown>) {
  return columns.some(
    (c) => c.type === "status" && c.options?.some((o) => o.done && o.label === data[c.key]),
  );
}

export function ProjectDepartmentsPanel({
  projectId,
  templateId,
  canEdit,
}: {
  projectId: string;
  templateId: string | null;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectDepartments);
  const loadFn = useServerFn(loadTemplateDepartments);
  const toTplFn = useServerFn(saveDepartmentsToTemplate);
  const delDeptFn = useServerFn(deleteDepartment);
  const key = ["project-departments", projectId];
  const q = useQuery({ queryKey: key, queryFn: () => listFn({ data: { projectId } }) });
  const depts = useMemo(() => q.data ?? [], [q.data]);
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [editDept, setEditDept] = useState<CostDepartment | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  useEffect(() => {
    if (!depts.length) setActiveDept(null);
    else if (!activeDept || !depts.some((d) => d.id === activeDept)) setActiveDept(depts[0].id);
  }, [depts, activeDept]);

  const load = useMutation({
    mutationFn: () => loadFn({ data: { projectId } }),
    onSuccess: (r) => {
      toast.success(
        r.added
          ? `${r.added} departamento(s) trazido(s) do modelo`
          : "O modelo não tem departamentos novos",
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toTpl = useMutation({
    mutationFn: () => toTplFn({ data: { projectId } }),
    onSuccess: (r) =>
      toast.success(
        `Estrutura salva no modelo (${r.count} departamento(s)). Novos projetos já nascem com ela.`,
      ),
    onError: (e: Error) => toast.error(e.message),
  });
  const delDept = useMutation({
    mutationFn: (id: string) => delDeptFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Departamento excluído");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dept = depts.find((d) => d.id === activeDept) ?? null;
  const importer = useSheetImport(key);

  return (
    <Card className="mt-4 rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Building2 className="h-4 w-4" /> Departamentos e controles de custo
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cada departamento (ex.: Compras) tem suas planilhas com as colunas que você definir.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {templateId && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={load.isPending}
                  onClick={() => load.mutate()}
                >
                  <Download className="h-4 w-4" /> Trazer do modelo
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={toTpl.isPending || !depts.length}
                  onClick={() => {
                    if (
                      confirm(
                        "Substituir os departamentos do modelo por esta estrutura (sem os lançamentos)?",
                      )
                    )
                      toTpl.mutate();
                  }}
                >
                  <Upload className="h-4 w-4" /> Salvar no modelo
                </Button>
              </>
            )}
            <ImportSheetButton
              busy={importer.busy}
              onFile={(f) => importer.run(f, dept ? { departmentId: dept.id } : { projectId })}
              label={dept ? `Importar planilha em ${dept.name}` : "Importar planilha"}
            />
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> Departamento
            </Button>
          </div>
        )}
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : q.isError ? (
        <p className="text-sm text-rose-600">Não foi possível carregar os departamentos.</p>
      ) : depts.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum departamento ainda.{" "}
          {canEdit
            ? "Crie um (ex.: Compras) ou use \"Importar planilha\" para trazer um arquivo Excel/CSV."
            : ""}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {depts.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveDept(d.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                  d.id === activeDept
                    ? "border-transparent text-white shadow-sm"
                    : "hover:bg-accent",
                )}
                style={d.id === activeDept ? { backgroundColor: d.color } : undefined}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: d.id === activeDept ? "#fff" : d.color }}
                />
                {d.name}
              </button>
            ))}
          </div>
          {dept && (
            <DepartmentView
              key={dept.id}
              dept={dept}
              canEdit={canEdit}
              queryKey={key}
              onEdit={() => setEditDept(dept)}
              onDelete={() => {
                if (
                  confirm(
                    `Excluir o departamento "${dept.name}" com todas as planilhas e lançamentos?`,
                  )
                )
                  delDept.mutate(dept.id);
              }}
            />
          )}
        </>
      )}

      <NewDepartmentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        projectId={projectId}
        onCreated={(id) => {
          refresh();
          setActiveDept(id);
        }}
      />
      <EditDepartmentDialog
        dept={editDept}
        onOpenChange={(v) => !v && setEditDept(null)}
        onSaved={refresh}
      />
    </Card>
  );
}

function DepartmentView({
  dept,
  canEdit,
  queryKey,
  onEdit,
  onDelete,
}: {
  dept: CostDepartment;
  canEdit: boolean;
  queryKey: unknown[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const sheetFn = useServerFn(saveSheet);
  const delSheetFn = useServerFn(deleteSheet);
  const [activeSheet, setActiveSheet] = useState<string | null>(dept.sheets[0]?.id ?? null);
  const [cfgSheet, setCfgSheet] = useState<CostSheet | "new" | null>(null);
  useEffect(() => {
    if (!dept.sheets.some((s) => s.id === activeSheet)) setActiveSheet(dept.sheets[0]?.id ?? null);
  }, [dept.sheets, activeSheet]);
  const delSheet = useMutation({
    mutationFn: (id: string) => delSheetFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Planilha excluída");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sheet = dept.sheets.find((s) => s.id === activeSheet) ?? null;
  const importer = useSheetImport(queryKey, (id) => setActiveSheet(id));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex flex-wrap items-center gap-1">
          {dept.sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSheet(s.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                s.id === activeSheet
                  ? "bg-muted font-semibold"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {s.name} <span className="text-xs text-muted-foreground">({s.rows.length})</span>
            </button>
          ))}
          {canEdit && (
            <>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setCfgSheet("new")}>
                <Plus className="h-3.5 w-3.5" /> Planilha
              </Button>
              <ImportSheetButton
                busy={importer.busy}
                onFile={(f) => importer.run(f, { departmentId: dept.id })}
                label="Importar Excel/CSV"
                className="h-8 border-dashed"
              />
            </>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-1">
            {sheet && (
              <>
                <ImportIntoSheet sheet={sheet} queryKey={queryKey} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => setCfgSheet(sheet)}
                >
                  <Columns3 className="h-3.5 w-3.5" /> Colunas
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-rose-600"
                  onClick={() => {
                    if (confirm(`Excluir a planilha "${sheet.name}" e os lançamentos?`))
                      delSheet.mutate(sheet.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={onEdit}
              title="Renomear departamento"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-rose-600"
              onClick={onDelete}
              title="Excluir departamento"
            >
              <Trash2 className="h-3.5 w-3.5" /> Depto.
            </Button>
          </div>
        )}
      </div>

      {sheet ? (
        <SheetGrid key={sheet.id} sheet={sheet} canEdit={canEdit} queryKey={queryKey} />
      ) : (
        <p className="text-sm text-muted-foreground">Sem planilhas neste departamento.</p>
      )}

      <SheetConfigDialog
        sheet={cfgSheet}
        departmentId={dept.id}
        onOpenChange={(v) => !v && setCfgSheet(null)}
        onSaved={(id) => {
          qc.invalidateQueries({ queryKey });
          setActiveSheet(id);
        }}
        saveFn={sheetFn}
      />
    </div>
  );
}

const VALIDITY_TONE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
  action: "bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-200",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200",
  late: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-200",
};

function ValidityChip({ value }: { value: unknown }) {
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

function ValidityLegend() {
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

/** Salva o "info" da planilha (cabeçalho, acréscimos, observações) ao sair do campo. */
function useSheetInfo(sheet: CostSheet, queryKey: unknown[]) {
  const qc = useQueryClient();
  const fn = useServerFn(saveSheetInfo);
  const [info, setInfo] = useState<SheetInfo>(sheet.info ?? {});
  useEffect(() => setInfo(sheet.info ?? {}), [sheet.id, sheet.info]);
  const save = useMutation({
    mutationFn: (next: SheetInfo) => fn({ data: { sheetId: sheet.id, info: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });
  return { info, setInfo, save: (next = info) => save.mutate(next) };
}

function SheetInfoHeader({
  info,
  canEdit,
  onChange,
  onCommit,
}: {
  info: SheetInfo;
  canEdit: boolean;
  onChange: (i: SheetInfo) => void;
  onCommit: () => void;
}) {
  const fields = info.fields ?? [];
  const alerts = (info.notes ?? []).filter((n) => !n.label && /alerta|aten/i.test(n.value));
  if (!fields.length && !alerts.length) return null;
  return (
    <section aria-label={info.title || "Dados da planilha"} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-extrabold">{info.title || "Dados da planilha"}</h4>
        {alerts.map((a, i) => (
          <span key={i} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
            ⚠ {a.value}
          </span>
        ))}
      </div>
      {fields.length > 0 && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
          {fields.map((f, i) => (
            <label key={f.key} className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{f.label}</span>
              <Input
                className="h-9"
                value={f.value}
                disabled={!canEdit}
                onChange={(e) => {
                  const next = fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x));
                  onChange({ ...info, fields: next });
                }}
                onBlur={onCommit}
              />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function SheetSummary({
  info,
  sheet,
  itemsTotal,
  totalLabel,
  canEdit,
  onChange,
  onCommit,
}: {
  info: SheetInfo;
  sheet: CostSheet;
  itemsTotal: number | null;
  totalLabel: string;
  canEdit: boolean;
  onChange: (i: SheetInfo) => void;
  onCommit: (i?: SheetInfo) => void;
}) {
  const adj = info.adjustments ?? [];
  const notes = (info.notes ?? []).filter((n) => n.label || !/alerta|aten/i.test(n.value));
  const hasValidity = sheet.columns.some((c) => c.type === "validity");
  if (!adj.length && !notes.length && !hasValidity && itemsTotal === null) return null;
  const grand = (itemsTotal ?? 0) + adj.reduce((a, x) => a + (x.value ?? 0), 0);
  return (
    <div className="flex flex-wrap items-start gap-4">
      {(notes.length > 0 || hasValidity) && (
        <section aria-label="Condições e observações" className="min-w-[280px] flex-[999_1_480px] space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
          {notes.length > 0 && (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {notes.map((n, i) => (
                <div key={i} className="min-w-0">
                  {n.label && <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{n.label}</p>}
                  <p className="text-sm font-semibold">{n.value}</p>
                </div>
              ))}
            </div>
          )}
          {hasValidity && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Situação pela validade (recalculada todo dia)
              </p>
              <ValidityLegend />
            </div>
          )}
        </section>
      )}
      {itemsTotal !== null && (adj.length > 0 || info.totalKey) && (
        <section aria-label="Resumo de valores" className="w-full max-w-[420px] flex-[1_1_340px] rounded-2xl border bg-card p-4 shadow-sm">
          <h4 className="mb-1 text-base font-extrabold">Resumo</h4>
          <div className="flex items-center justify-between gap-3 border-t py-2.5 text-sm">
            <span>{totalLabel}</span>
            <strong className="tabular-nums">{maskBRL(itemsTotal)}</strong>
          </div>
          {adj.map((a, i) => (
            <div key={a.key} className="flex items-center justify-between gap-3 border-t py-2 text-sm">
              <span>
                + {a.label} {a.note && <span className="text-muted-foreground">({a.note})</span>}
              </span>
              <Input
                className="h-8 w-32 text-right tabular-nums"
                inputMode="decimal"
                disabled={!canEdit}
                aria-label={a.label}
                placeholder="0,00"
                value={a.value === null || a.value === undefined ? "" : String(a.value).replace(".", ",")}
                onChange={(e) => {
                  const n = toNumber(e.target.value);
                  const next = adj.map((x, j) => (j === i ? { ...x, value: e.target.value.trim() === "" ? null : n } : x));
                  onChange({ ...info, adjustments: next });
                }}
                onBlur={() => onCommit()}
              />
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-primary px-4 py-3 text-base font-extrabold text-primary-foreground">
            <span>Total geral</span>
            <span className="tabular-nums">{maskBRL(grand)}</span>
          </div>
        </section>
      )}
    </div>
  );
}

function SheetGrid({
  sheet,
  canEdit,
  queryKey,
}: {
  sheet: CostSheet;
  canEdit: boolean;
  queryKey: unknown[];
}) {
  const qc = useQueryClient();
  const rowFn = useServerFn(saveRow);
  const delRowFn = useServerFn(deleteRow);
  const cols = sheet.columns;
  const addRow = useMutation({
    mutationFn: () => rowFn({ data: { sheetId: sheet.id, data: {} } }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });
  const removeRow = useMutation({
    mutationFn: (id: string) => delRowFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  // totais com os valores mais recentes (inclusive os editados e ainda não recarregados)
  const [live, setLive] = useState<Record<string, Record<string, unknown>>>({});
  const rowsData = sheet.rows.map((r) => live[r.id] ?? r.data);
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of cols) {
      if (!c.sum) continue;
      t[c.key] = rowsData.reduce<number>((acc, d) => {
        const v = c.type === "calc" ? calcValue(c, d, cols) : toNumber(d[c.key]);
        return acc + (v ?? 0);
      }, 0);
    }
    return t;
  }, [cols, rowsData]);
  const hasTotals = cols.some((c) => c.sum);
  const sheetInfo = useSheetInfo(sheet, queryKey);
  const totalCol = cols.find((c) => c.key === sheetInfo.info.totalKey && c.sum);

  return (
    <div className="space-y-3">
      <SheetInfoHeader
        info={sheetInfo.info}
        canEdit={canEdit}
        onChange={sheetInfo.setInfo}
        onCommit={() => sheetInfo.save()}
      />
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="w-10 px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground">
                #
              </th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className="whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  style={{ minWidth: c.width ?? (c.type === "text" ? 150 : 120) }}
                >
                  {c.label}
                </th>
              ))}
              {canEdit && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 && (
              <tr>
                <td
                  colSpan={cols.length + 2}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Nenhum lançamento. {canEdit ? "Clique em “Adicionar linha”." : ""}
                </td>
              </tr>
            )}
            {sheet.rows.map((r, i) => (
              <RowEditor
                key={r.id}
                index={i}
                row={r}
                columns={cols}
                canEdit={canEdit}
                onLive={(d) => setLive((m) => ({ ...m, [r.id]: d }))}
                onSave={(d) => rowFn({ data: { id: r.id, sheetId: sheet.id, data: d } })}
                onDelete={() => {
                  if (confirm("Excluir esta linha?")) removeRow.mutate(r.id);
                }}
              />
            ))}
          </tbody>
          {hasTotals && sheet.rows.length > 0 && (
            <tfoot className="bg-muted/40 font-semibold">
              <tr>
                <td className="px-2 py-2 text-[11px] text-muted-foreground">Total</td>
                {cols.map((c) => (
                  <td key={c.key} className="px-2 py-2 tabular-nums">
                    {c.sum
                      ? fmtNumber(
                          totals[c.key] ?? 0,
                          c.type === "calc"
                            ? c.calc?.asPercent
                              ? "calc-percent"
                              : c.calc?.asCurrency
                                ? "currency"
                                : "number"
                            : c.type,
                        )
                      : ""}
                  </td>
                ))}
                {canEdit && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {canEdit && (
        <Button
          size="sm"
          variant="outline"
          disabled={addRow.isPending}
          onClick={() => addRow.mutate()}
        >
          <Plus className="h-4 w-4" /> Adicionar linha
        </Button>
      )}
      <SheetSummary
        info={sheetInfo.info}
        sheet={sheet}
        itemsTotal={totalCol ? totals[totalCol.key] ?? 0 : null}
        totalLabel="Total dos itens"
        canEdit={canEdit}
        onChange={sheetInfo.setInfo}
        onCommit={(i) => sheetInfo.save(i)}
      />
    </div>
  );
}

function RowEditor({
  index,
  row,
  columns,
  canEdit,
  onSave,
  onDelete,
  onLive,
}: {
  index: number;
  row: CostRow;
  columns: CostColumn[];
  canEdit: boolean;
  onSave: (d: Record<string, string | number | boolean | null>) => Promise<unknown>;
  onDelete: () => void;
  onLive: (d: Record<string, unknown>) => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>(row.data ?? {});
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setData(row.data ?? {});
    setDirty(false);
  }, [row.id, row.updated_at]);

  const resolved = rowIsResolved(columns, data);
  const today = new Date(new Date().toDateString());

  function set(key: string, value: unknown, saveNow = false) {
    const next = { ...data, [key]: value };
    setData(next);
    onLive(next);
    if (saveNow) persist(next);
    else setDirty(true);
  }
  async function persist(d = data) {
    try {
      const clean: Record<string, string | number | boolean | null> = {};
      for (const [k, v] of Object.entries(d)) {
        clean[k] = v === undefined ? null : (v as string | number | boolean | null);
      }
      await onSave(clean);
      setDirty(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <tr
      className="border-t align-middle"
      onBlur={(e) => {
        if (dirty && !e.currentTarget.contains(e.relatedTarget as Node)) persist();
      }}
    >
      <td className="px-2 py-1 text-xs text-muted-foreground tabular-nums">{index + 1}</td>
      {columns.map((c) => {
        const v = data[c.key];
        if (c.type === "validity") {
          return (
            <td key={c.key} className="px-2 py-1.5">
              <ValidityChip value={c.validity ? data[c.validity.ref] : null} />
            </td>
          );
        }
        if (c.type === "calc") {
          const n = calcValue(c, data, columns);
          return (
            <td key={c.key} className="px-2 py-1 tabular-nums text-muted-foreground" title={c.calc?.expr ? "Calculado pela fórmula da planilha" : undefined}>
              {fmtNumber(n, c.calc?.asPercent ? "calc-percent" : c.calc?.asCurrency ? "currency" : "number")}
            </td>
          );
        }
        if (!canEdit) {
          return (
            <td key={c.key} className="px-2 py-1.5">
              {c.type === "status" ? (
                <StatusChip column={c} value={v as string} />
              ) : c.type === "currency" || c.type === "number" || c.type === "percent" ? (
                fmtNumber(toNumber(v), c.type)
              ) : c.type === "date" && v ? (
                new Date(`${String(v)}T12:00:00`).toLocaleDateString("pt-BR")
              ) : c.type === "boolean" ? (
                v ? (
                  "Sim"
                ) : (
                  "Não"
                )
              ) : (
                String(v ?? "")
              )}
            </td>
          );
        }
        if (c.type === "status") {
          return (
            <td key={c.key} className="px-1 py-1">
              <Select
                value={(v as string) ?? ""}
                onValueChange={(nv) => set(c.key, nv === "__none" ? null : nv, true)}
              >
                <SelectTrigger className="h-8 border-transparent bg-transparent px-1 shadow-none hover:border-border">
                  <SelectValue placeholder="—">
                    {v ? <StatusChip column={c} value={v as string} /> : "—"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {(c.options ?? []).map((o) => (
                    <SelectItem key={o.label} value={o.label}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: o.color }}
                        />
                        {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </td>
          );
        }
        if (c.type === "boolean") {
          return (
            <td key={c.key} className="px-2 py-1">
              <Checkbox checked={!!v} onCheckedChange={(nv) => set(c.key, nv === true, true)} />
            </td>
          );
        }
        const overdue = Boolean(
          c.type === "date" &&
          c.alert &&
          v &&
          !resolved &&
          new Date(`${String(v)}T12:00:00`) < today,
        );
        return (
          <td key={c.key} className={cn("px-1 py-1", overdue && "bg-rose-50 dark:bg-rose-500/10")}>
            <Input
              type={c.type === "date" ? "date" : "text"}
              inputMode={c.type === "text" || c.type === "date" ? undefined : "decimal"}
              value={(v as string | number | undefined) ?? ""}
              onChange={(e) => set(c.key, e.target.value)}
              placeholder={c.type === "currency" ? "0,00" : c.type === "percent" ? "%" : ""}
              className={cn(
                "h-8 border-transparent bg-transparent px-1.5 shadow-none hover:border-border focus-visible:bg-background",
                (c.type === "currency" || c.type === "number" || c.type === "percent") &&
                  "text-right tabular-nums",
                overdue && "font-medium text-rose-700",
              )}
              title={overdue ? "Vencido" : undefined}
            />
          </td>
        );
      })}
      {canEdit && (
        <td className="px-1 py-1">
          <div className="flex items-center">
            {dirty && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => persist()}
                aria-label="Salvar linha"
              >
                <Save className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-rose-600"
              onClick={onDelete}
              aria-label="Excluir linha"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      )}
    </tr>
  );
}

function StatusChip({ column, value }: { column: CostColumn; value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const o = column.options?.find((x) => x.label === value);
  const color = o?.color ?? "#64748b";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${color}1f`, color }}
    >
      {value}
    </span>
  );
}

function NewDepartmentDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  onCreated: (id: string) => void;
}) {
  const createFn = useServerFn(createDepartment);
  const [preset, setPreset] = useState<string>("compras");
  const [name, setName] = useState("Compras");
  const [color, setColor] = useState(DEPT_COLORS[0]);
  useEffect(() => {
    if (!open) return;
    setPreset("compras");
    setName("Compras");
    setColor(DEPT_COLORS[0]);
  }, [open]);
  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          projectId,
          name: name.trim(),
          color,
          preset: preset === "blank" ? undefined : preset,
        },
      }),
    onSuccess: (r) => {
      toast.success("Departamento criado");
      onOpenChange(false);
      onCreated(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo departamento</DialogTitle>
          <DialogDescription>
            Comece de um modelo pronto ou em branco. Nomes e colunas podem ser alterados depois.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ...DEPARTMENT_PRESETS.map((p) => ({
                key: p.key,
                name: p.name,
                description: p.description,
                color: p.color,
              })),
              {
                key: "blank",
                name: "Em branco",
                description: `1 planilha simples (${BLANK_SHEET.columns.length} colunas)`,
                color: "#64748b",
              },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setPreset(p.key);
                  setName(p.key === "blank" ? "" : p.name);
                  setColor(p.color);
                }}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  preset === p.key ? "border-primary ring-2 ring-primary/20" : "hover:bg-accent",
                )}
              >
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Nome do departamento</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Compras, Obras, Jurídico"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {DEPT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full border-2",
                  color === c ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDepartmentDialog({
  dept,
  onOpenChange,
  onSaved,
}: {
  dept: CostDepartment | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const updFn = useServerFn(updateDepartment);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEPT_COLORS[0]);
  useEffect(() => {
    if (dept) {
      setName(dept.name);
      setColor(dept.color);
    }
  }, [dept]);
  const save = useMutation({
    mutationFn: () => updFn({ data: { id: dept!.id, name: name.trim(), color } }),
    onSuccess: () => {
      toast.success("Departamento atualizado");
      onOpenChange(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={!!dept} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Departamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {DEPT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full border-2",
                  color === c ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DraftCol = CostColumn & { optionsText?: string };

function optionsToText(c: CostColumn) {
  return (c.options ?? []).map((o) => `${o.label}${o.done ? "*" : ""}`).join(", ");
}
function textToOptions(text: string, prev?: CostColumn["options"]) {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw, i) => {
      const done = raw.endsWith("*");
      const label = raw.replace(/\*$/, "").trim();
      const old = prev?.find((o) => o.label === label);
      return {
        label,
        color: old?.color ?? STATUS_COLORS[i % STATUS_COLORS.length],
        ...(done ? { done: true } : {}),
      };
    });
}

function SheetConfigDialog({
  sheet,
  departmentId,
  onOpenChange,
  onSaved,
  saveFn,
}: {
  sheet: CostSheet | "new" | null;
  departmentId: string;
  onOpenChange: (v: boolean) => void;
  onSaved: (id: string) => void;
  saveFn: (args: {
    data: { id?: string; departmentId: string; name: string; columns: CostColumn[] };
  }) => Promise<{ id: string }>;
}) {
  const [name, setName] = useState("");
  const [cols, setCols] = useState<DraftCol[]>([]);
  useEffect(() => {
    if (!sheet) return;
    const base = sheet === "new" ? BLANK_SHEET : sheet;
    setName(sheet === "new" ? "Nova planilha" : base.name);
    setCols(base.columns.map((c) => ({ ...c, optionsText: optionsToText(c) })));
  }, [sheet]);

  const save = useMutation({
    mutationFn: () => {
      const columns: CostColumn[] = cols
        .filter((c) => c.label.trim())
        .map(({ optionsText, ...c }) => ({
          ...c,
          label: c.label.trim(),
          options: c.type === "status" ? textToOptions(optionsText ?? "", c.options) : undefined,
          calc: c.type === "calc" ? (c.calc ?? { op: "div", a: "", b: "" }) : undefined,
          sum: ["number", "currency", "calc"].includes(c.type) ? !!c.sum : undefined,
          alert: c.type === "date" ? !!c.alert : undefined,
          validity:
            c.type === "validity"
              ? { ref: c.validity?.ref || cols.find((x) => x.type === "date")?.key || "" }
              : undefined,
        }));
      return saveFn({
        data: {
          ...(sheet && sheet !== "new" ? { id: sheet.id } : {}),
          departmentId,
          name: name.trim(),
          columns,
        },
      });
    },
    onSuccess: (r) => {
      toast.success("Planilha salva");
      onOpenChange(false);
      onSaved(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = (i: number, p: Partial<DraftCol>) =>
    setCols((d) => d.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const move = (i: number, dir: -1 | 1) =>
    setCols((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const n = [...d];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const numericCols = cols.filter((c) =>
    ["number", "currency", "percent", "calc"].includes(c.type),
  );

  return (
    <Dialog open={!!sheet} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>{sheet === "new" ? "Nova planilha" : "Colunas da planilha"}</DialogTitle>
          <DialogDescription>
            Status: separe as opções por vírgula e marque com * as que encerram a linha (ex.:
            Entregue*). Datas com “alerta” ficam vermelhas quando vencem e a linha não está
            encerrada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Nome da planilha</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {cols.map((c, i) => (
            <div key={`${c.key}-${i}`} className="space-y-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="text-muted-foreground disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="Subir"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground disabled:opacity-30"
                    disabled={i === cols.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Descer"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input
                  className="h-8 min-w-[160px] flex-1"
                  value={c.label}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  placeholder="Nome da coluna"
                />
                <Select
                  value={c.type}
                  onValueChange={(v) => patch(i, { type: v as CostColumnType })}
                >
                  <SelectTrigger className="h-8 w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(COLUMN_TYPE_LABEL) as CostColumnType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {COLUMN_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {c.type === "validity" && (
                  <Select
                    value={c.validity?.ref || ""}
                    onValueChange={(v) => patch(i, { validity: { ref: v } })}
                  >
                    <SelectTrigger className="h-8 w-[180px]" aria-label="Data usada na situação">
                      <SelectValue placeholder="Data de referência" />
                    </SelectTrigger>
                    <SelectContent>
                      {cols.filter((x) => x.type === "date").map((x) => (
                        <SelectItem key={x.key} value={x.key}>
                          pela data: {x.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {["number", "currency", "calc"].includes(c.type) && (
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={!!c.sum}
                      onCheckedChange={(v) => patch(i, { sum: v === true })}
                    />{" "}
                    Somar
                  </label>
                )}
                {c.type === "date" && (
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={!!c.alert}
                      onCheckedChange={(v) => patch(i, { alert: v === true })}
                    />{" "}
                    Alerta de vencimento
                  </label>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-rose-600"
                  onClick={() => setCols((d) => d.filter((_, j) => j !== i))}
                  aria-label="Remover coluna"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {c.type === "status" && (
                <Input
                  className="h-8 text-xs"
                  value={c.optionsText ?? ""}
                  onChange={(e) => patch(i, { optionsText: e.target.value })}
                  placeholder="Ex.: Pendente, Pedido feito, Entregue*"
                />
              )}
              {c.type === "calc" && c.calc?.expr && (
                <p className="rounded-md bg-primary/10 px-2 py-1.5 text-xs">
                  Fórmula importada: <strong>= {exprLabel(c.calc.expr, (k) => cols.find((x) => x.key === k)?.label ?? k)}</strong>
                  <span className="text-muted-foreground"> · escolher outra conta abaixo substitui esta.</span>
                </p>
              )}
              {c.type === "calc" && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Select
                    value={c.calc?.a ?? ""}
                    onValueChange={(v) =>
                      patch(i, {
                        calc: {
                          op: c.calc?.op ?? "div",
                          a: v,
                          b: c.calc?.b ?? "",
                          asPercent: c.calc?.asPercent,
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[160px]">
                      <SelectValue placeholder="Coluna A" />
                    </SelectTrigger>
                    <SelectContent>
                      {numericCols
                        .filter((x) => x.key !== c.key)
                        .map((x) => (
                          <SelectItem key={x.key} value={x.key}>
                            {x.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={c.calc?.op ?? "div"}
                    onValueChange={(v) =>
                      patch(i, {
                        calc: {
                          op: v as "div",
                          a: c.calc?.a ?? "",
                          b: c.calc?.b ?? "",
                          asPercent: c.calc?.asPercent,
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[90px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="div">÷</SelectItem>
                      <SelectItem value="mul">×</SelectItem>
                      <SelectItem value="sub">−</SelectItem>
                      <SelectItem value="add">+</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={c.calc?.b ?? ""}
                    onValueChange={(v) =>
                      patch(i, {
                        calc: {
                          op: c.calc?.op ?? "div",
                          a: c.calc?.a ?? "",
                          b: v,
                          asPercent: c.calc?.asPercent,
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[160px]">
                      <SelectValue placeholder="Coluna B" />
                    </SelectTrigger>
                    <SelectContent>
                      {numericCols
                        .filter((x) => x.key !== c.key)
                        .map((x) => (
                          <SelectItem key={x.key} value={x.key}>
                            {x.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {(c.calc?.op ?? "div") === "div" && (
                    <label className="flex items-center gap-1.5">
                      <Checkbox
                        checked={!!c.calc?.asPercent}
                        onCheckedChange={(v) =>
                          patch(i, {
                            calc: {
                              op: "div",
                              a: c.calc?.a ?? "",
                              b: c.calc?.b ?? "",
                              asPercent: v === true,
                            },
                          })
                        }
                      />{" "}
                      em %
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCols((d) => [
                ...d,
                { key: slugKey("coluna", new Set(d.map((x) => x.key))), label: "", type: "text" },
              ])
            }
          >
            <Plus className="h-4 w-4" /> Adicionar coluna
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
