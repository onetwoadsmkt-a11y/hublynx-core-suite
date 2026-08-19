import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getFinanceBaixaInfo, registrarBaixa } from "@/lib/finance/finance.functions";
import { formatDateBR } from "@/lib/finance/format";
import { Money } from "@/components/finance/Money";

export function BaixaDialog({
  financeId,
  open,
  onOpenChange,
}: {
  financeId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const infoFn = useServerFn(getFinanceBaixaInfo);
  const saveFn = useServerFn(registrarBaixa);

  const { data: info } = useQuery({
    queryKey: ["finance", "baixa-info", financeId],
    queryFn: () => infoFn({ data: { id: financeId as string } }),
    enabled: open && !!financeId,
  });

  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [forma, setForma] = useState("");

  useEffect(() => {
    if (!open || !info) return;
    setValor(String(info.saldo.toFixed(2)));
    setData(new Date().toISOString().slice(0, 10));
    setForma(info.payment_method ?? "");
  }, [open, info]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: financeId as string,
          valor: Number(String(valor).replace(",", ".")),
          data,
          forma_pagamento: forma || null,
        },
      }),
    onSuccess: () => {
      toast.success("Baixa registrada");
      qc.invalidateQueries({ queryKey: ["finance"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar baixa</DialogTitle>
        </DialogHeader>
        {info ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">{info.description || "—"}</p>
              <p className="text-[12.2px] text-muted-foreground">
                Vencimento {formatDateBR(info.due_date)}
              </p>
              <div className="mt-2 flex items-center justify-between text-[12.2px] text-muted-foreground">
                <span>Valor em aberto</span>
                <Money value={info.saldo} className="text-[14.5px] font-semibold text-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="baixa-valor">Valor</Label>
                <Input id="baixa-valor" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="baixa-data">Data</Label>
                <Input id="baixa-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="baixa-forma">Forma de pagamento</Label>
              <Input
                id="baixa-forma"
                value={forma}
                onChange={(e) => setForma(e.target.value)}
                placeholder="Pix, boleto, transferência…"
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!info || save.isPending}>
            Confirmar baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
