import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listPipelines, listAllStages } from "@/lib/pipeline/pipeline.functions";
import { upsertForm, type FormListItem } from "@/lib/forms/forms.functions";

export function FormDialog({
  open,
  onOpenChange,
  form,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form?: FormListItem | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pipelineId, setPipelineId] = useState<string>("");
  const [stageId, setStageId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setName(form?.name ?? "");
    setDescription(form?.description ?? "");
    setPipelineId(form?.pipeline_id ?? "");
    setStageId(form?.pipeline_stage_id ?? "");
  }, [open, form]);

  const pipelinesFn = useServerFn(listPipelines);
  const { data: pipelines } = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => pipelinesFn(),
    enabled: open,
  });

  const stagesFn = useServerFn(listAllStages);
  const { data: allStages } = useQuery({
    queryKey: ["pipeline-stages-all"],
    queryFn: () => stagesFn(),
    enabled: open,
  });
  const stages = (allStages ?? []).filter((s) => s.pipeline_id === pipelineId);

  const saveFn = useServerFn(upsertForm);
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          ...(form?.id ? { id: form.id } : {}),
          name: name.trim(),
          description: description.trim() || null,
          pipeline_id: pipelineId || null,
          pipeline_stage_id: stageId || null,
        },
      }),
    onSuccess: () => {
      toast.success(form ? "Formulário atualizado" : "Formulário criado");
      qc.invalidateQueries({ queryKey: ["forms"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form ? "Editar formulário" : "Novo formulário"}</DialogTitle>
          <DialogDescription>
            Defina o nome, o pipeline de destino e a etapa em que os leads deste formulário
            deverão entrar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="form-name">Nome do formulário *</Label>
            <Input
              id="form-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="Formulário de Qualificação — Franquia"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="form-desc">Descrição interna</Label>
            <Textarea
              id="form-desc"
              value={description}
              maxLength={500}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Uso interno do CRM. Não aparece para quem preenche."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Pipeline de destino</Label>
              <Select
                value={pipelineId}
                onValueChange={(v) => {
                  setPipelineId(v);
                  setStageId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(pipelines ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Etapa inicial</Label>
              <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder={pipelineId ? "Selecione" : "Escolha o pipeline"} />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
