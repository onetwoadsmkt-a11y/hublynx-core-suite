import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";

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
  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (kindFilter !== "all" && it.kind !== kindFilter) return false;
      const per: Periodicity = it.recurrence === "monthly" ? "mensal" : "diaria";
      if (periodFilter !== "all" && per !== periodFilter) return false;
      return true;
    });
  }, [items, kindFilter, periodFilter]);

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
            Receitas e despesas (diárias e mensais) deste projeto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            {!q.isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nenhum lançamento</TableCell></TableRow>
            )}
            {filtered.map((r) => {
              const per = r.recurrence === "monthly" ? "Mensal" : "Diária";
              const isRev = r.kind === "receber";
              return (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(r.due_date)}</TableCell>
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
