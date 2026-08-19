import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getFinanceFormLookups, upsertFinance } from "@/lib/finance/finance.functions";
import type { FinanceKind, FinanceRow } from "@/lib/finance/types";

export function FinanceFormDialog({
  open, onOpenChange, kind, initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: FinanceKind;
  initial?: FinanceRow | null;
}) {
  const qc = useQueryClient();
  const lookupsFn = useServerFn(getFinanceFormLookups);
  const saveFn = useServerFn(upsertFinance);
  const { data: lookups } = useQuery({
    queryKey: ["finance", "lookups"],
    queryFn: () => lookupsFn(),
  });

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [clientId, setClientId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [supplier, setSupplier] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [installments, setInstallments] = useState(1);
  const [status, setStatus] = useState<"aberto" | "quitado">("aberto");

  useEffect(() => {
    if (!open) return;
    setDescription(initial?.description ?? "");
    setAmount(initial ? String(initial.amount) : "");
    setDueDate(initial?.due_date ?? new Date().toISOString().slice(0, 10));
    setClientId(initial?.client_id ?? "");
    setProjectId(initial?.project_id ?? "");
    setCategoryId(initial?.category_id ?? "");
    setSupplier(initial?.supplier ?? "");
    setPaymentMethod(initial?.payment_method ?? "");
    setRecurring(initial?.recurrence === "monthly");
    setInstallments(initial?.installment_total ?? 1);
    setStatus(initial?.status === "quitado" ? "quitado" : "aberto");
  }, [open, initial]);

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount.replace(",", "."));
      if (!amt || amt <= 0) throw new Error("Valor inválido");
      await saveFn({
        data: {
          id: initial?.id,
          kind,
          description: description || null,
          amount: amt,
          due_date: dueDate,
          status,
          client_id: clientId || null,
          project_id: projectId || null,
          category_id: categoryId || null,
          supplier: supplier || null,
          payment_method: paymentMethod || null,
          recurrence: recurring ? "monthly" : "none",
          recurrence_day: recurring ? new Date(dueDate).getUTCDate() : null,
          installments: installments > 1 ? installments : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(initial ? "Lançamento atualizado" : "Lançamento criado");
      qc.invalidateQueries({ queryKey: ["finance"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cats = (lookups?.categories ?? []).filter((c) => c.kind === kind);
  const isReceita = kind === "receber";
  const filteredProjects = clientId
    ? (lookups?.projects ?? []).filter((p) => p.client_id === clientId)
    : lookups?.projects ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar" : "Nova"} {isReceita ? "Receita" : "Despesa"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {isReceita ? (
              <div>
                <Label>Cliente</Label>
                <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {lookups?.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Fornecedor</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </div>
            )}
            <div>
              <Label>Projeto</Label>
              <Select value={projectId || "none"} onValueChange={(v) => setProjectId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {filteredProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberto">Pendente</SelectItem>
                  <SelectItem value="quitado">{isReceita ? "Recebido" : "Pago"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Método pagamento</Label>
              <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Pix, Boleto…" />
            </div>
            <div>
              <Label>Parcelas</Label>
              <Input
                type="number" min={1} max={60}
                value={installments}
                onChange={(e) => setInstallments(Math.max(1, Number(e.target.value) || 1))}
                disabled={!!initial || recurring}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <Label className="cursor-pointer">Recorrência mensal</Label>
              <p className="text-xs text-muted-foreground">Gera lançamentos automaticamente todo mês.</p>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} disabled={!!initial || installments > 1} />
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
