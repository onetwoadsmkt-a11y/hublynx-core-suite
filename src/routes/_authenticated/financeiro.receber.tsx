import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listFinances, markFinanceStatus, deleteFinance } from "@/lib/finance/finance.functions";
import { MonthYearPicker } from "@/components/finance/MonthYearPicker";
import { FinanceFormDialog } from "@/components/finance/FinanceFormDialog";
import { brl } from "@/components/finance/KpiCard";
import type { FinanceKind, FinanceRow } from "@/lib/finance/types";

export function FinanceListPage({ kind, title }: { kind: FinanceKind; title: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { month, year } = { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
  const search = (Route as never as { useSearch: () => { month: number; year: number } })
    .useSearch?.() ?? { month, year };
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceRow | null>(null);

  const listFn = useServerFn(listFinances);
  const markFn = useServerFn(markFinanceStatus);
  const delFn = useServerFn(deleteFinance);

  const { data: rows } = useQuery({
    queryKey: ["finance", "list", kind, search.month, search.year, statusFilter, q],
    queryFn: () =>
      listFn({
        data: { kind, month: search.month, year: search.year, status: statusFilter, q: q || undefined },
      }),
  });

  const mark = useMutation({
    mutationFn: (id: string) => markFn({ data: { id, status: "pago" } }),
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

  const total = (rows ?? []).reduce((s, r) => s + r.amount, 0);
  const realizado = (rows ?? []).filter((r) => r.status === "pago").reduce((s, r) => s + r.amount, 0);

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
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="pago">{kind === "receber" ? "Recebido" : "Pago"}</SelectItem>
              <SelectItem value="atrasado">Atrasado</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>
      </div>

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
                <TableCell>{new Date(r.due_date + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="text-right tabular-nums">{brl(r.amount)}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "pago" ? "default" : r.status === "atrasado" ? "destructive" : "secondary"}>
                    {r.status === "pago" ? (kind === "receber" ? "Recebido" : "Pago") : r.status === "atrasado" ? "Atrasado" : "Pendente"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    {r.status !== "pago" && (
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

      <div className="flex justify-end gap-6 text-sm">
        <div>Realizado: <span className="font-semibold tabular-nums">{brl(realizado)}</span></div>
        <div>Total: <span className="font-semibold tabular-nums">{brl(total)}</span></div>
      </div>

      <FinanceFormDialog open={dialogOpen} onOpenChange={setDialogOpen} kind={kind} initial={editing} />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/financeiro/receber")({
  component: () => <FinanceListPage kind="receber" title="Contas a Receber" />,
});
