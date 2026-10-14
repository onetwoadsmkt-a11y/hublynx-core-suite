import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Columns3,
  Download,
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
  slugKey,
  toNumber,
  type CostColumn,
  type CostColumnType,
} from "@/lib/projects/cost-presets";
import {
  createDepartment,
  deleteDepartment,
  deleteRow,
  deleteSheet,
  listProjectDepartments,
  loadTemplateDepartments,
  saveDepartmentsToTemplate,
  saveRow,
  saveSheet,
  updateDepartment,
  type CostDepartment,
  type CostRow,
  type CostSheet,
} from "@/lib/projects/costs.functions";

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
            ? "Crie um (ex.: Compras) para controlar pedidos, fornecedores e custos deste projeto."
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
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setCfgSheet("new")}>
              <Plus className="h-3.5 w-3.5" /> Planilha
            </Button>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-1">
            {sheet && (
              <>
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
        const v = c.type === "calc" ? calcValue(c, d) : toNumber(d[c.key]);
        return acc + (v ?? 0);
      }, 0);
    }
    return t;
  }, [cols, rowsData]);
  const hasTotals = cols.some((c) => c.sum);

  return (
    <div className="space-y-2">
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
        if (c.type === "calc") {
          const n = calcValue(c, data);
          return (
            <td key={c.key} className="px-2 py-1 tabular-nums text-muted-foreground">
              {fmtNumber(n, c.calc?.asPercent ? "calc-percent" : "number")}
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
