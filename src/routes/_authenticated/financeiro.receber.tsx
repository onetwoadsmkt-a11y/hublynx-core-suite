import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays,
  format, isSameMonth, isSameDay,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Plus, CheckCircle2, Pencil, Trash2, List, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listFinances, markFinanceStatus, deleteFinance } from "@/lib/finance/finance.functions";
import { MonthYearPicker } from "@/components/finance/MonthYearPicker";
import { FinanceFormDialog } from "@/components/finance/FinanceFormDialog";
import { brl } from "@/components/finance/KpiCard";
import { getFinanceMetrics } from "@/lib/finance/metrics.functions";
import { formatDateBR } from "@/lib/finance/format";
import { listServicos } from "@/lib/finance/servicos.functions";
import type { FinanceKind, FinanceRow } from "@/lib/finance/types";

export function FinanceListPage({ kind }: { kind: FinanceKind; title?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const routerSearch = useRouterState({ select: (s) => s.location.search as { month?: number; year?: number } });
  const month = Number(routerSearch?.month) || new Date().getMonth() + 1;
  const year = Number(routerSearch?.year) || new Date().getFullYear();
  const search = { month, year };
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [servicoId, setServicoId] = useState<string>("all");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceRow | null>(null);

  const listFn = useServerFn(listFinances);
  const markFn = useServerFn(markFinanceStatus);
  const delFn = useServerFn(deleteFinance);

  const { data: rows } = useQuery({
    queryKey: ["finance", "list", kind, search.month, search.year, statusFilter, q, servicoId],
    queryFn: () =>
      listFn({
        data: {
          kind,
          month: search.month,
          year: search.year,
          status: statusFilter,
          q: q || undefined,
          ...(servicoId !== "all" ? { servicoId } : {}),
        },
      }),
  });

  const servicosFn = useServerFn(listServicos);
  const { data: servicos } = useQuery({ queryKey: ["finance", "servicos"], queryFn: () => servicosFn() });

  const mark = useMutation({
    mutationFn: (id: string) => markFn({ data: { id, status: "quitado" } }),
    onSuccess: () => {
      toast.success(kind === "receber" ? "Recebido" : "Pago");
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Excluído");
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
  });

  const metricsFn = useServerFn(getFinanceMetrics);
  const { data: metrics } = useQuery({
    queryKey: ["finance", "metrics", search.month, search.year],
    queryFn: () => metricsFn({ data: { month: search.month, year: search.year } }),
  });
  // Fonte única: nunca recalcular receita/despesa nesta tela.
  const total = kind === "receber" ? (metrics?.receita_mes ?? 0) : (metrics?.despesas_mes ?? 0);
  const realizado = kind === "receber" ? (metrics?.recebido_mes ?? 0) : (metrics?.pago_mes ?? 0);

  const byDay = useMemo(() => {
    const map = new Map<string, FinanceRow[]>();
    for (const r of rows ?? []) {
      if (!r.due_date) continue;
      const arr = map.get(r.due_date) ?? [];
      arr.push(r);
      map.set(r.due_date, arr);
    }
    return map;
  }, [rows]);

  const cursor = new Date(year, month - 1, 1);
  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const weekLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  const isReceber = kind === "receber";
  const colorChipBg = isReceber ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800";
  const colorText = isReceber ? "text-emerald-600" : "text-red-600";
  const sign = isReceber ? "+" : "−";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthYearPicker
          month={search.month}
          year={search.year}
          onChange={(m, y) =>
            navigate({ to: kind === "receber" ? "/financeiro/receber" : "/financeiro/pagar", search: { month: m, year: y } })
          }
        />
        <div className="flex items-center gap-2">
          <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "list" | "calendar")}>
            <ToggleGroupItem value="list" aria-label="Lista"><List className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="calendar" aria-label="Calendário"><CalendarDays className="h-4 w-4" /></ToggleGroupItem>
          </ToggleGroup>
          {view === "list" && (
            <>
              <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
              <Select value={servicoId} onValueChange={setServicoId}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as linhas</SelectItem>
                  {(servicos ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="aberto">Pendente</SelectItem>
                  <SelectItem value="quitado">{kind === "receber" ? "Recebido" : "Pago"}</SelectItem>
                  <SelectItem value="atrasado">Atrasado</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>{kind === "receber" ? "Cliente" : "Fornecedor"}</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum lançamento neste mês.</TableCell></TableRow>
              )}
              {(rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.description || "—"}</div>
                    {r.installment_total ? (
                      <div className="text-xs text-muted-foreground">Parcela {r.installment_no}/{r.installment_total}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{kind === "receber" ? r.client_name : r.supplier ?? "—"}</TableCell>
                  <TableCell>{r.category_name ?? "—"}</TableCell>
                  <TableCell className="text-[12.2px] text-muted-foreground">{formatDateBR(r.due_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(r.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "quitado" ? "default" : r.status === "atrasado" ? "destructive" : "secondary"}>
                      {r.status === "quitado" ? (kind === "receber" ? "Recebido" : "Pago") : r.status === "atrasado" ? "Atrasado" : "Pendente"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      {r.status !== "quitado" && (
                        <Button size="icon" variant="ghost" title="Marcar como pago" onClick={() => mark.mutate(r.id)}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => del.mutate(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-7 gap-px bg-border">
            {weekLabels.map((l) => (
              <div key={l} className="bg-muted text-[11px] font-medium uppercase text-muted-foreground px-2 py-1.5 text-center">
                {l}
              </div>
            ))}
            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const items = byDay.get(key) ?? [];
              const inMonth = isSameMonth(d, cursor);
              const isToday = isSameDay(d, new Date());
              const sum = items.reduce((s, r) => s + r.amount, 0);
              return (
                <div
                  key={key}
                  className={cn(
                    "bg-card min-h-[110px] p-1.5 flex flex-col gap-1",
                    !inMonth && "bg-muted/30 text-muted-foreground",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-xs font-semibold tabular-nums h-5 w-5 flex items-center justify-center rounded-full",
                      isToday && "bg-primary text-primary-foreground",
                    )}>
                      {format(d, "d")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {sum > 0 && (
                      <div
                        className={cn("text-[11px] font-semibold rounded px-1.5 py-0.5 tabular-nums truncate", colorChipBg)}
                        title={`${brl(sum)} (${items.length} lançamento${items.length > 1 ? "s" : ""})`}
                      >
                        {sign} {brl(sum)}
                      </div>
                    )}
                    {items.slice(0, 2).map((r) => (
                      <button
                        key={r.id}
                        onClick={() => { setEditing(r); setDialogOpen(true); }}
                        className="w-full text-left text-[10px] truncate text-muted-foreground hover:text-foreground"
                        title={r.description || ""}
                      >
                        {r.description || (kind === "receber" ? r.client_name : r.supplier) || "—"}
                      </button>
                    ))}
                    {items.length > 2 && (
                      <div className="text-[10px] text-muted-foreground">+{items.length - 2} mais</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-6 text-sm">
        <div>Realizado: <span className="font-semibold tabular-nums">{brl(realizado)}</span></div>
        <div>Total: <span className={cn("font-semibold tabular-nums", colorText)}>{brl(total)}</span></div>
      </div>

      <FinanceFormDialog open={dialogOpen} onOpenChange={setDialogOpen} kind={kind} initial={editing} />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/financeiro/receber")({
  component: () => <FinanceListPage kind="receber" />,
});
