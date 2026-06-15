import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Circle, Pencil, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { updateRoadmapStages } from "@/lib/projects/projects.functions";

export type RoadmapStage = { name: string; done: boolean };

const DEFAULT_STAGES: RoadmapStage[] = [
  { name: "Briefing", done: false },
  { name: "Planejamento", done: false },
  { name: "Produção", done: false },
  { name: "Aprovação", done: false },
  { name: "Entrega", done: false },
];

export function RoadmapStagesPanel({
  projectId,
  stages: initialStages,
  disabled = false,
  disabledMessage,
}: {
  projectId: string;
  stages: RoadmapStage[] | null | undefined;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateRoadmapStages);
  const stages =
    Array.isArray(initialStages) && initialStages.length > 0
      ? initialStages
      : DEFAULT_STAGES;

  if (disabled) {
    return (
      <Card className="rounded-2xl p-5 opacity-80">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Roadmap do Projeto</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {disabledMessage ?? "Roadmap indisponível para este modelo de projeto."}
        </p>
      </Card>
    );
  }

  const [editing, setEditing] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (next: RoadmapStage[]) =>
      updateFn({ data: { project_id: projectId, stages: next } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = stages.length;
  const doneCount = stages.filter((s) => s.done).length;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const currentIdx = stages.findIndex((s) => !s.done);

  function toggleStage(idx: number) {
    // Click a stage: marks it as the current step.
    // All stages before it become done, this one and the rest become pending.
    // Clicking the last done stage moves it back one step.
    const isDone = stages[idx].done;
    const next = stages.map((s, i) => {
      if (isDone) return { ...s, done: i < idx };
      return { ...s, done: i <= idx };
    });
    saveMutation.mutate(next);
  }

  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm">Roadmap do Projeto</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {doneCount} de {total} etapas concluídas — {percent}%
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" /> Editar etapas
        </Button>
      </div>

      <div className="relative">
        {/* Track */}
        <div className="absolute left-0 right-0 top-4 h-1 bg-muted rounded-full" />
        <div
          className="absolute left-0 top-4 h-1 bg-primary rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />

        <ol className="relative grid gap-2" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {stages.map((s, i) => {
            const isDone = s.done;
            const isCurrent = !isDone && i === currentIdx;
            return (
              <li key={i} className="flex flex-col items-center min-w-0">
                <button
                  type="button"
                  onClick={() => toggleStage(i)}
                  disabled={saveMutation.isPending}
                  className={[
                    "relative z-10 h-9 w-9 rounded-full grid place-items-center border-2 transition-all",
                    isDone
                      ? "bg-primary border-primary text-primary-foreground"
                      : isCurrent
                        ? "bg-background border-primary text-primary ring-4 ring-primary/15"
                        : "bg-background border-muted-foreground/30 text-muted-foreground hover:border-primary/60",
                  ].join(" ")}
                  aria-label={`Etapa ${s.name}`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                </button>
                <p
                  className={[
                    "mt-2 text-[11px] text-center font-medium truncate w-full px-1",
                    isDone || isCurrent ? "text-foreground" : "text-muted-foreground",
                  ].join(" ")}
                  title={s.name}
                >
                  {s.name}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="text-[11px] text-muted-foreground mt-4">
        Clique numa etapa para avançar até ela. Clique numa etapa concluída para retroceder.
      </p>

      <EditStagesDialog
        open={editing}
        onOpenChange={setEditing}
        stages={stages}
        onSave={(next) => {
          saveMutation.mutate(next);
          setEditing(false);
        }}
      />
    </Card>
  );
}

function EditStagesDialog({
  open,
  onOpenChange,
  stages,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stages: RoadmapStage[];
  onSave: (next: RoadmapStage[]) => void;
}) {
  const [draft, setDraft] = useState<RoadmapStage[]>(stages);

  useEffect(() => {
    if (open) setDraft(stages.map((s) => ({ ...s })));
  }, [open, stages]);

  function update(idx: number, name: string) {
    setDraft((d) => d.map((s, i) => (i === idx ? { ...s, name } : s)));
  }
  function remove(idx: number) {
    setDraft((d) => d.filter((_, i) => i !== idx));
  }
  function add() {
    setDraft((d) => [...d, { name: "Nova etapa", done: false }]);
  }
  function move(idx: number, dir: -1 | 1) {
    setDraft((d) => {
      const next = [...d];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return d;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function save() {
    const cleaned = draft
      .map((s) => ({ ...s, name: s.name.trim() }))
      .filter((s) => s.name.length > 0);
    if (cleaned.length === 0) {
      toast.error("Adicione pelo menos uma etapa");
      return;
    }
    onSave(cleaned);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar etapas do roadmap</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto py-1">
          {draft.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs leading-none"
                  aria-label="Mover para cima"
                >▲</button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === draft.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs leading-none"
                  aria-label="Mover para baixo"
                >▼</button>
              </div>
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                value={s.name}
                onChange={(e) => update(i, e.target.value)}
                placeholder="Nome da etapa"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => remove(i)}
                className="text-rose-600 hover:text-rose-700 shrink-0"
                aria-label="Remover etapa"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={add} className="w-full mt-2">
            <Plus className="h-4 w-4" /> Adicionar etapa
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
