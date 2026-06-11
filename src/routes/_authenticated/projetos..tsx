
// =====================================================
// Commercial Panel
function CommercialPanel({ commercial, projectId }: { commercial: any; projectId: string }) {
  const qc = useQueryClient();
  const genFn = useServerFn(generateRecurringInvoice);
  const gen = useMutation({
    mutationFn: () => genFn({ data: { project_id: projectId } }),
    onSuccess: () => {
      toast.success("Cobrança gerada");
      qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  if (!commercial) return null;
  const c = commercial;
  const model = c.model as string;

  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4" /> Comercial
          <span className="text-xs font-normal text-muted-foreground">· {COMMERCIAL_LABEL[model] ?? model}</span>
          {c.serviceType && <span className="text-xs font-normal text-muted-foreground">· {SERVICE_LABEL[c.serviceType] ?? c.serviceType}</span>}
        </h3>
        {(model === "mensal_recorrente" || model === "suporte_continuo") && (
          <Button size="sm" variant="outline" onClick={() => gen.mutate()} disabled={gen.isPending}>
            <Plus className="h-4 w-4" /> Gerar próxima cobrança
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiTile icon={DollarSign} label="Receita" value={brl(c.revenue)} tone="text-emerald-600" />
        <KpiTile icon={Wallet} label="Custos" value={brl(c.costs)} />
        <KpiTile icon={TrendingUp} label="Lucro" value={brl(c.profit)} tone={c.profit >= 0 ? "text-emerald-600" : "text-rose-600"} />
        <KpiTile icon={Sparkles} label="Margem" value={`${c.margin.toFixed(1)}%`} tone={c.margin >= 0 ? "text-emerald-600" : "text-rose-600"} />
      </div>

      {model === "projeto_fechado" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiTile icon={Briefcase} label="Contratado" value={brl(c.contractValue)} />
          <KpiTile icon={DollarSign} label="Recebido" value={brl(c.revenue)} tone="text-emerald-600" />
          <KpiTile icon={Clock} label="Pendente" value={brl(c.pending)} tone="text-amber-600" />
        </div>
      )}

      {(model === "mensal_recorrente" || model === "suporte_continuo") && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile icon={DollarSign} label="Valor mensal" value={brl(c.monthlyValue)} />
          <KpiTile icon={CalIcon} label="Próxima cobrança" value={fmtDate(c.nextBilling)} />
          <KpiTile icon={CheckCircle2} label="Meses pagos" value={c.monthsPaid} tone="text-emerald-600" />
          <KpiTile icon={AlertCircle} label="Meses pendentes" value={c.monthsPending} tone={c.monthsPending > 0 ? "text-amber-600" : ""} />
        </div>
      )}

      {model === "por_hora" && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiTile icon={Clock} label="Valor/hora" value={brl(c.hourlyRate)} />
          <KpiTile icon={Hourglass} label="Horas registradas" value={`${c.hoursWorked}h`} />
          <KpiTile icon={TrendingUp} label="Receita gerada" value={brl(c.billableValue)} tone="text-emerald-600" />
        </div>
      )}

      {model === "banco_horas" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile icon={Briefcase} label="Contratadas" value={`${c.hoursContracted}h`} />
            <KpiTile icon={Hourglass} label="Utilizadas" value={`${c.hoursWorked}h`} />
            <KpiTile icon={CheckCircle2} label="Restantes" value={`${c.hoursRemaining}h`} tone={c.hoursRemaining <= 0 ? "text-rose-600" : "text-emerald-600"} />
            <KpiTile icon={DollarSign} label="Valor/hora" value={brl(c.hourlyRate)} />
          </div>
          {c.hoursContracted > 0 && (
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Consumo do banco</span>
                <span className="font-semibold">{Math.min(100, Math.round((c.hoursWorked / c.hoursContracted) * 100))}%</span>
              </div>
              <Progress value={Math.min(100, (c.hoursWorked / c.hoursContracted) * 100)} className="h-2" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
