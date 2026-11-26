import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getReopenInfo, reopenWonLead } from "@/lib/pipeline/reopen.functions";

export type StageOption = { id: string; name: string; pipeline_id: string | null; pipeline_name: string; is_won?: boolean; is_lost?: boolean };

/**
 * "Desfazer venda ganha": o lead volta para uma etapa em aberto. Projeto e cliente criados
 * na conversão podem ser excluídos (só administrador da empresa) ou mantidos.
 */
export function ReopenWonLeadDialog({
  leadId, leadName, open, onOpenChange, stages, onDone,
}: {
  leadId: string;
  leadName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stages: StageOption[];
  onDone?: (stageId: string) => void;
}) {
  const qc = useQueryClient();
  const infoFn = useServerFn(getReopenInfo);
  const reopenFn = useServerFn(reopenWonLead);
  const infoQ = useQuery({
    queryKey: ["reopen-info", leadId],
    queryFn: () => infoFn({ data: { leadId } }),
    enabled: open,
    staleTime: 0,
  });
  const info = infoQ.data;

  const openStages = useMemo(() => stages.filter((s) => !s.is_won && !s.is_lost), [stages]);
  const pipelines = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of openStages) if (s.pipeline_id && !m.has(s.pipeline_id)) m.set(s.pipeline_id, s.pipeline_name);
    return [...m].map(([id, name]) => ({ id, name }));
  }, [openStages]);

  const [pipelineId, setPipelineId] = useState<string>("");
  const [stageId, setStageId] = useState<string>("");
  const [delProject, setDelProject] = useState(false);
  const [delClient, setDelClient] = useState(false);
  const [reason, setReason] = useState("");

  // Sugestão: a etapa de antes da venda ganha (senão, a 1ª etapa do mesmo pipeline)
  useEffect(() => {
    if (!open || !info) return;
    const prev = info.previousStageId ? openStages.find((s) => s.id === info.previousStageId) : undefined;
    const pid = prev?.pipeline_id ?? info.pipelineId ?? pipelines[0]?.id ?? "";
    setPipelineId(pid);
    setStageId(prev?.id ?? openStages.find((s) => s.pipeline_id === pid)?.id ?? "");
    setDelProject(false);
    setDelClient(false);
    setReason("");
  }, [open, info, openStages, pipelines]);

  const stagesOfPipeline = openStages.filter((s) => s.pipeline_id === pipelineId);

  const run = useMutation({
    mutationFn: () =>
      reopenFn({ data: { leadId, stageId, deleteProject: delProject, deleteClient: delClient, reason: reason.trim() || undefined } }),
    onSuccess: (r) => {
      toast.success(`Venda ganha desfeita: ${leadName} voltou para "${r.stageName}".`, {
        description: r.removed.length ? `Excluído: ${r.removed.join(" e ")}.` : undefined,
      });
      qc.invalidateQueries();
      onDone?.(stageId);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = info?.project;
  const c = info?.client;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5" /> Desfazer venda ganha</DialogTitle>
          <DialogDescription>
            {leadName} deixa de ser venda ganha e volta para uma etapa em aberto do funil. As automações dessa etapa não são disparadas de novo.
          </DialogDescription>
        </DialogHeader>

        {infoQ.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : infoQ.error ? (
          <p className="text-sm text-destructive">{(infoQ.error as Error).message}</p>
        ) : info && !info.isWon ? (
          <p className="text-sm text-muted-foreground">Este lead não está como venda ganha.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Pipeline</Label>
                <Select value={pipelineId} onValueChange={(v) => { setPipelineId(v); setStageId(openStages.find((s) => s.pipeline_id === v)?.id ?? ""); }}>
                  <SelectTrigger><SelectValue placeholder="Pipeline" /></SelectTrigger>
                  <SelectContent>{pipelines.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Voltar para a etapa</Label>
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger><SelectValue placeholder="Escolha a etapa" /></SelectTrigger>
                  <SelectContent>
                    {stagesOfPipeline.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}{s.id === info?.previousStageId ? " (antes da venda)" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(p || c) && (
              <div className="space-y-2.5 rounded-xl border bg-muted/40 p-3 text-sm">
                <p className="font-semibold">Criado na conversão</p>
                {p && (
                  <label className="flex items-start gap-2.5">
                    <Checkbox checked={delProject} disabled={!info?.isAdmin} onCheckedChange={(v) => { setDelProject(!!v); if (!v) setDelClient(false); }} className="mt-0.5" />
                    <span>
                      Excluir o projeto <b>{p.name}</b>
                      <span className="block text-xs text-muted-foreground">
                        {p.openTasks} tarefa(s) aberta(s) e {p.doneTasks} concluída(s). As abertas são encerradas. Sem marcar, o projeto continua em Projetos.
                      </span>
                    </span>
                  </label>
                )}
                {c && (
                  <label className="flex items-start gap-2.5">
                    <Checkbox
                      checked={delClient}
                      disabled={!info?.isAdmin || !c.canRemove || (!!p && !delProject)}
                      onCheckedChange={(v) => setDelClient(!!v)}
                      className="mt-0.5"
                    />
                    <span>
                      Remover o cliente <b>{c.name}</b>
                      <span className="block text-xs text-muted-foreground">
                        {!c.canRemove
                          ? `Não pode ser removido: tem ${c.otherProjects} outro(s) projeto(s) e ${c.otherLeads} outro(s) lead(s) ligado(s), ou não foi criado nesta conversão.`
                          : p && !delProject
                            ? "Para remover o cliente, marque também a exclusão do projeto."
                            : "Sem marcar, o cadastro continua em Clientes."}
                      </span>
                    </span>
                  </label>
                )}
                {!info?.isAdmin && <p className="text-xs text-muted-foreground">Só o administrador da empresa pode excluir o projeto ou o cliente.</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Motivo (opcional)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: marcado como venda ganha por engano" rows={2} maxLength={500} />
              <p className="text-xs text-muted-foreground">Fica registrado na jornada do lead.</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => run.mutate()} disabled={!stageId || run.isPending || !info?.isWon}>
            {run.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Desfazer venda ganha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
