import { Fragment, useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileText, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import {
  listProjectFinances, upsertProjectFinance, deleteProjectFinance,
  generateRecurringInvoice,
} from "@/lib/projects/projects.functions";

type Kind = "receber" | "pagar";
type Periodicity = "diaria" | "mensal";
type Status = "pendente" | "pago";

type Entry = {
  id: string;
  kind: Kind;
  description: string | null;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: Status | "atrasado";
  recurrence: "none" | "monthly";
  payment_method: string | null;
  installment_no?: number | null;
  installment_total?: number | null;
};

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}
function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("pt-BR") : "—";
}

export function ProjectCommercialTable({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectFinances);
  const delFn = useServerFn(deleteProjectFinance);
  const genFn = useServerFn(generateRecurringInvoice);

  const q = useQuery({
    queryKey: ["project-finances", projectId],
    queryFn: () => listFn({ data: { project_id: projectId } }),
  });

  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | Periodicity>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [defaultKind, setDefaultKind] = useState<Kind>("receber");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsEntry, setDetailsEntry] = useState<Entry | null>(null);

  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDesc, setChargeDesc] = useState("");

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Lançamento removido");
      qc.invalidateQueries({ queryKey: ["project-finances", projectId] });
      qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] });
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const genMut = useMutation({
    mutationFn: () =>
      genFn({
        data: {
          project_id: projectId,
          amount: chargeAmount ? Number(chargeAmount.replace(",", ".")) : undefined,
          description: chargeDesc || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Cobrança gerada");
      setChargeOpen(false);
      setChargeAmount("");
      setChargeDesc("");
      qc.invalidateQueries({ queryKey: ["project-finances", projectId] });
      qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] });
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const items: Entry[] = (q.data?.items ?? []) as any;

  const currentMonthKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const [monthFilter, setMonthFilter] = useState<string>(currentMonthKey);

  // Lista de meses disponíveis (a partir dos itens) — sempre inclui o mês atual
  const monthOptions = useMemo(() => {
    const set = new Set<string>([currentMonthKey]);
    for (const it of items) {
      const d = new Date(it.due_date);
      if (isNaN(d.getTime())) continue;
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items, currentMonthKey]);

  function monthLabelOf(key: string) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, (m ?? 1) - 1, 1);
    const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (kindFilter !== "all" && it.kind !== kindFilter) return false;
      const per: Periodicity = it.recurrence === "monthly" ? "mensal" : "diaria";
      if (periodFilter !== "all" && per !== periodFilter) return false;
      if (monthFilter !== "all") {
        const d = new Date(it.due_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key !== monthFilter) return false;
      }
      return true;
    });
  }, [items, kindFilter, periodFilter, monthFilter]);

  // Agrupar por mês (atual primeiro) -> depois por descrição
  type DescGroup = { label: string; rows: Entry[]; total: number; kinds: Set<Kind> };
  type MonthGroup = { key: string; label: string; descs: DescGroup[] };
  const monthGroups: MonthGroup[] = useMemo(() => {
    const byMonth = new Map<string, Map<string, DescGroup>>();
    for (const r of filtered) {
      const d = new Date(r.due_date);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inner = byMonth.get(mKey) ?? new Map<string, DescGroup>();
      const raw = (r.description ?? "").trim();
      const dKey = raw ? raw.toLowerCase() : "__sem__";
      const label = raw || "Sem descrição";
      const g = inner.get(dKey) ?? { label, rows: [], total: 0, kinds: new Set<Kind>() };
      g.rows.push(r);
      g.total += Number(r.amount) || 0;
      g.kinds.add(r.kind);
      inner.set(dKey, g);
      byMonth.set(mKey, inner);
    }
    const keys = Array.from(byMonth.keys()).sort((a, b) => {
      if (a === currentMonthKey) return -1;
      if (b === currentMonthKey) return 1;
      return b.localeCompare(a);
    });
    return keys.map((k) => ({
      key: k,
      label: monthLabelOf(k),
      descs: Array.from(byMonth.get(k)!.values()).sort((a, b) =>
        a.label.localeCompare(b.label, "pt-BR"),
      ),
    }));
  }, [filtered, currentMonthKey]);

  const totals = useMemo(() => {
    let rev = 0, exp = 0;
    for (const r of filtered) {
      if (r.status === "pago") {
        if (r.kind === "receber") rev += Number(r.amount) || 0;
        else exp += Number(r.amount) || 0;
      }
    }
    return { rev, exp, balance: rev - exp };
  }, [filtered]);

  function openNew(kind: Kind) {
    setDefaultKind(kind);
    setEditing(null);
    setDialogOpen(true);
  }

  return (
    <div className="border rounded-2xl p-4 bg-card mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h4 className="font-semibold text-sm">Lançamentos Comerciais</h4>
          <p className="text-xs text-muted-foreground">
            Agrupados por mês e descrição. Mês atual sempre em primeiro.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              {monthOptions.map((k) => (
                <SelectItem key={k} value={k}>
                  {monthLabelOf(k)}{k === currentMonthKey ? " (atual)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as any)}>
            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="receber">Receitas</SelectItem>
              <SelectItem value="pagar">Despesas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as any)}>
            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Periodicidade</SelectItem>
              <SelectItem value="diaria">Diária</SelectItem>
              <SelectItem value="mensal">Mensal</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => openNew("receber")}>
            <Plus className="h-4 w-4" /> Receita
          </Button>
          <Button size="sm" variant="outline" onClick={() => openNew("pagar")}>
            <Plus className="h-4 w-4" /> Despesa
          </Button>
          <Button size="sm" onClick={() => setChargeOpen(true)}>
            <FileText className="h-4 w-4" /> Gerar cobrança
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Periodicidade</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
            )}
            {!q.isLoading && monthGroups.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nenhum lançamento encontrado</TableCell></TableRow>
            )}
            {monthGroups.map((mg) => (
              <Fragment key={`m-${mg.key}`}>
                <TableRow className="bg-primary/10 hover:bg-primary/10">
                  <TableCell colSpan={7} className="font-bold text-xs uppercase tracking-wider text-primary py-2">
                    {mg.label}{mg.key === currentMonthKey ? " · Mês atual" : ""}
                  </TableCell>
                </TableRow>
                {mg.descs.map((g) => {
                  return (
                    <Fragment key={`g-${mg.key}-${g.label}`}>
                      {g.rows.map((r) => {
                        const per = r.recurrence === "monthly" ? "Mensal" : "Diária";
                        const isRev = r.kind === "receber";
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap pl-8">{fmtDate(r.due_date)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={isRev ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>
                                {isRev ? "Receita" : "Despesa"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{per}</TableCell>
                            <TableCell className="max-w-[260px] truncate">{r.description || "—"}</TableCell>
                            <TableCell className={`text-right font-medium ${isRev ? "text-emerald-600" : "text-rose-600"}`}>
                              {brl(Number(r.amount))}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                r.status === "pago" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : r.status === "atrasado" ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                              }>
                                {r.status === "pago" ? (isRev ? "Recebido" : "Pago") : r.status === "atrasado" ? "Atrasado" : "Pendente"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setDetailsEntry(r); setDetailsOpen(true); }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(r); setDefaultKind(r.kind); setDialogOpen(true); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600"
                                onClick={() => { if (confirm("Remover lançamento?")) delMut.mutate(r.id); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}

          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 mt-3 text-xs">
        <span className="text-muted-foreground">Receita realizada: <strong className="text-emerald-600 ml-1">{brl(totals.rev)}</strong></span>
        <span className="text-muted-foreground">Despesa realizada: <strong className="text-rose-600 ml-1">{brl(totals.exp)}</strong></span>
        <span className="text-muted-foreground">Saldo: <strong className={totals.balance >= 0 ? "text-emerald-600 ml-1" : "text-rose-600 ml-1"}>{brl(totals.balance)}</strong></span>
      </div>

      <EntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        defaultKind={defaultKind}
        initial={editing}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["project-finances", projectId] });
          qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] });
          qc.invalidateQueries({ queryKey: ["finance"] });
        }}
      />

      <EntryDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        entry={detailsEntry}
        onEdit={(e) => {
          setDetailsOpen(false);
          setEditing(e);
          setDefaultKind(e.kind);
          setDialogOpen(true);
        }}
      />

      <Dialog open={chargeOpen} onOpenChange={setChargeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Gerar cobrança</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} placeholder="Deixe vazio para usar valor mensal" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={chargeDesc} onChange={(e) => setChargeDesc(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChargeOpen(false)}>Cancelar</Button>
            <Button onClick={() => genMut.mutate()} disabled={genMut.isPending}>
              {genMut.isPending ? "Gerando…" : "Gerar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EntryDetailsDialog({
  open, onOpenChange, entry, onEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: Entry | null;
  onEdit: (e: Entry) => void;
}) {
  if (!entry) return null;
  const isRev = entry.kind === "receber";
  const per = entry.recurrence === "monthly" ? "Mensal" : "Diária";

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Resumo do lançamento
            <Badge variant="outline" className={isRev ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>
              {isRev ? "Receita" : "Despesa"}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="grid">
          <Row label="Descrição" value={entry.description || "—"} />
          <Row label="Valor" value={<span className={isRev ? "text-emerald-600" : "text-rose-600"}>{brl(Number(entry.amount))}</span>} />
          <Row label="Vencimento" value={fmtDate(entry.due_date)} />
          <Row label="Pagamento" value={fmtDate(entry.paid_at)} />
          <Row label="Status" value={
            <Badge variant="outline" className={
              entry.status === "pago" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : entry.status === "atrasado" ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
            }>
              {entry.status === "pago" ? (isRev ? "Recebido" : "Pago") : entry.status === "atrasado" ? "Atrasado" : "Pendente"}
            </Badge>
          } />
          <Row label="Periodicidade" value={per} />
          <Row label="Recorrência" value={entry.recurrence === "monthly" ? "Mensal" : "Sem recorrência"} />
          <Row label="Método" value={entry.payment_method || "—"} />
          {entry.installment_total && entry.installment_total > 1 && (
            <Row label="Parcela" value={`${entry.installment_no ?? 1} / ${entry.installment_total}`} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => onEdit(entry)}>Editar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntryDialog({
  open, onOpenChange, projectId, defaultKind, initial, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  defaultKind: Kind;
  initial: Entry | null;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(upsertProjectFinance);
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [periodicity, setPeriodicity] = useState<Periodicity>("diaria");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<Status>("pendente");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [installments, setInstallments] = useState(1);
  const [installmentMode, setInstallmentMode] = useState<"split" | "fixed">("split");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setKind(initial.kind);
      setPeriodicity(initial.recurrence === "monthly" ? "mensal" : "diaria");
      setDescription(initial.description ?? "");
      setAmount(String(initial.amount));
      setDueDate(initial.due_date);
      setStatus(initial.status === "pago" ? "pago" : "pendente");
      setPaymentMethod(initial.payment_method ?? "");
      setInstallments(1);
      setInstallmentMode("split");
    } else {
      setKind(defaultKind);
      setPeriodicity("diaria");
      setDescription("");
      setAmount("");
      setDueDate(new Date().toISOString().slice(0, 10));
      setStatus("pendente");
      setPaymentMethod("");
      setInstallments(1);
      setInstallmentMode("split");
    }
  }, [open, initial, defaultKind]);


  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount.replace(",", "."));
      if (!amt || amt <= 0) throw new Error("Valor inválido");
      await saveFn({
        data: {
          id: initial?.id,
          project_id: projectId,
          kind,
          periodicity,
          description: description || null,
          amount: amt,
          due_date: dueDate,
          status,
          payment_method: paymentMethod || null,
          installments: !initial ? installments : 1,
          installment_mode: installmentMode,
        },
      });

    },
    onSuccess: () => {
      toast.success(initial ? "Atualizado" : "Lançamento criado");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isRev = kind === "receber";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar" : "Novo"} lançamento</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receber">Receita</SelectItem>
                  <SelectItem value="pagar">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Periodicidade</Label>
              <Select value={periodicity} onValueChange={(v) => setPeriodicity(v as Periodicity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diaria">Diária</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">{isRev ? "Recebido" : "Pago"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Método</Label>
              <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Pix, Boleto…" />
            </div>
          </div>
          {!initial && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={installments}
                  onChange={(e) => setInstallments(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                />
              </div>
              {installments > 1 && (
                <div>
                  <Label>Valor informado é</Label>
                  <Select value={installmentMode} onValueChange={(v) => setInstallmentMode(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="split">Total (dividir)</SelectItem>
                      <SelectItem value="fixed">Por parcela</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {installments > 1 && (
                <p className="col-span-2 text-xs text-muted-foreground -mt-1">
                  {installmentMode === "split"
                    ? `${installments}x de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(amount.replace(",", ".")) || 0) / installments)} (mensal)`
                    : `${installments}x de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(amount.replace(",", ".")) || 0)} (mensal)`}
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
