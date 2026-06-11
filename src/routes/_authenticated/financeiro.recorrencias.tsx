import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listRecurringContracts, runRecurringRollover } from "@/lib/finance/finance.functions";
import { brl } from "@/components/finance/KpiCard";
import { toast } from "sonner";
import { Repeat } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro/recorrencias")({
  component: RecorrenciasPage,
});

function RecorrenciasPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listRecurringContracts);
  const roll = useServerFn(runRecurringRollover);
  const { data } = useQuery({ queryKey: ["finance", "recurring"], queryFn: () => listFn() });

  const gen = useMutation({
    mutationFn: () => roll(),
    onSuccess: (r) => {
      toast.success(`${r.created.length} lançamento(s) gerado(s)`);
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Contratos mensais — geram lançamentos automaticamente todo mês.</p>
        <Button onClick={() => gen.mutate()} disabled={gen.isPending}>
          <Repeat className="h-4 w-4 mr-1" /> Gerar próximos
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(data ?? []).length === 0 && (
          <Card className="p-8 text-center text-muted-foreground col-span-full">
            Nenhum contrato recorrente. Crie um lançamento com "Recorrência mensal" ativada.
          </Card>
        )}
        {(data ?? []).map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="font-semibold truncate">{r.description ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {r.client_name ?? r.project_name ?? ""}
                </p>
              </div>
              <Badge variant={r.kind === "receber" ? "default" : "secondary"}>
                {r.kind === "receber" ? "Receita" : "Despesa"}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-xs text-muted-foreground">Valor</p><p className="font-semibold">{brl(r.amount)}</p></div>
              <div><p className="text-xs text-muted-foreground">Dia</p><p className="font-semibold">{r.day ?? "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Próximo</p><p className="font-semibold">{r.next}</p></div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
