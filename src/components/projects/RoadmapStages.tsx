import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Circle, Pencil, Plus, Trash2, GripVertical, LayoutTemplate, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  listProjectStages,
  saveProjectStages,
  setStageProgress,
  listProjectTemplates,
  applyTemplateToProject,
  listProjectStageTasks,
  addProjectStageTask,
  setProjectStageTaskDone,
  type ProjectStage,
  type StageTask,
} from "@/lib/projects/stages.functions";

type Draft = {
  id?: string;
  name: string;
  due_date: string | null;
  status: ProjectStage["status"];
  percent: number;
};

const DEFAULT_STAGES: Draft[] = [
  { name: "Briefing", due_date: null, status: "not_started", percent: 0 },
  { name: "Planejamento", due_date: null, status: "not_started", percent: 0 },
  { name: "Produção", due_date: null, status: "not_started", percent: 0 },
  { name: "Aprovação", due_date: null, status: "not_started", percent: 0 },
  { name: "Entrega", due_date: null, status: "not_started", percent: 0 },
];

export function RoadmapStagesPanel({
  projectId,
  disabled = false,
  disabledMessage,
}: {
  projectId: string;
  /** Mantido por compatibilidade: etapas antigas em JSONB não são mais usadas. */
  stages?: unknown;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectStages);
  const saveFn = useServerFn(saveProjectStages);
  const progressFn = useServerFn(setStageProgress);
  const templatesFn = useServerFn(listProjectTemplates);
  const applyFn = useServerFn(applyTemplateToProject);
  const stageTasksFn = useServerFn(listProjectStageTasks);
  const addTaskFn = useServerFn(addProjectStageTask);
  const doneTaskFn = useServerFn(setProjectStageTaskDone);
  const [editing, setEditing] = useState(false);
  const [openStage, setOpenStage] = useState<ProjectStage | null>(null);

  const stagesQ = useQuery({
    queryKey: ["project-stages", projectId],
    queryFn: () => listFn({ data: { project_id: projectId } }),
    enabled: !disabled,
    staleTime: 30_000,
  });

  const templatesQ = useQuery({
    queryKey: ["project-templates"],
    queryFn: () => templatesFn(),
    enabled: !disabled,
    staleTime: 5 * 60_000,
  });

  const stageTasksQ = useQuery({
    queryKey: ["project-stage-tasks", projectId],
    queryFn: () => stageTasksFn({ data: { project_id: projectId } }),
    enabled: !disabled,
    staleTime: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project-stages", projectId] });
    qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] });
    qc.invalidateQueries({ queryKey: ["project-stage-tasks", projectId] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const addTaskM = useMutation({
    mutationFn: (v: { stage_id: string; title: string; due_date: string | null }) =>
      addTaskFn({ data: { project_id: projectId, ...v } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const doneTaskM = useMutation({
    mutationFn: (v: { task_id: string; done: boolean }) => doneTaskFn({ data: v }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const saveM = useMutation({
    mutationFn: (next: Draft[]) =>
      saveFn({
        data: {
          project_id: projectId,
          stages: next.map((s) => ({
            id: s.id,
            name: s.name,
            due_date: s.due_date,
            status: s.status,
            percent: s.percent,
          })),
        },
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const progressM = useMutation({
    mutationFn: (v: { stage_id: string; status: ProjectStage["status"] }) =>
      progressFn({ data: { project_id: projectId, ...v } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const applyM = useMutation({
    mutationFn: (templateId: string) =>
      applyFn({ data: { project_id: projectId, template_id: templateId, replace: true } }),
    onSuccess: () => {
      toast.success("Modelo aplicado ao roadmap");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const stages: ProjectStage[] = stagesQ.data ?? [];
  const total = stages.length;
  const doneCount = stages.filter((s) => s.status === "done").length;
  const percent =
    total > 0 ? Math.round(stages.reduce((a, s) => a + (s.percent ?? 0), 0) / total) : 0;
  const currentIdx = stages.findIndex((s) => s.status !== "done");
  const templates = templatesQ.data ?? [];
  const allStageTasks: StageTask[] = stageTasksQ.data ?? [];
  const tasksByStage = new Map<string, StageTask[]>();
  for (const t of allStageTasks) {
    if (!t.stage_id) continue;
    tasksByStage.set(t.stage_id, [...(tasksByStage.get(t.stage_id) ?? []), t]);
  }
  const stageProgress = (stageId: string) => {
    const list = tasksByStage.get(stageId) ?? [];
    const done = list.filter((t) => t.status === "concluido").length;
    return { total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
  };

  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm">Roadmap do Projeto</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {doneCount} de {total} etapas concluídas — {percent}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={applyM.isPending}>
                  <LayoutTemplate className="h-3.5 w-3.5" /> Aplicar modelo
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {templates.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onClick={() => {
                      if (total > 0 && !confirm("Isso substitui as etapas atuais. Continuar?")) return;
                      applyM.mutate(t.id);
                    }}
                  >
                    {t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Editar etapas
          </Button>
        </div>
      </div>

      {stagesQ.isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando etapas...</p>
      ) : total === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma etapa cadastrada. Use “Editar etapas” ou aplique um modelo.
        </p>
      ) : (
        <div className="relative">
          <div className="absolute left-0 right-0 top-4 h-1 bg-muted rounded-full" />
          <div
            className="absolute left-0 top-4 h-1 bg-primary rounded-full transition-all"
            style={{ width: `${percent}%` }}
          />

          <ol
            className="relative grid gap-2"
            style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
          >
            {stages.map((s, i) => {
              const isDone = s.status === "done";
              const isCurrent = !isDone && i === currentIdx;
              return (
                <li key={s.id} className="flex flex-col items-center min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      progressM.mutate({ stage_id: s.id, status: isDone ? "not_started" : "done" })
                    }
                    disabled={progressM.isPending}
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
                  {s.due_date && (
                    <p className="text-[10px] text-muted-foreground">
                      {s.due_date.split("-").reverse().join("/")}
                    </p>
                  )}
                  {(() => {
                    const p = stageProgress(s.id);
                    return (
                      <button
                        type="button"
                        onClick={() => setOpenStage(s)}
                        className="mt-1.5 w-full rounded-lg border px-1.5 py-1 text-[10px] leading-tight hover:bg-accent/50 transition"
                        title={`Tarefas da etapa ${s.name}`}
                      >
                        <span className="flex items-center justify-center gap-1 font-semibold">
                          <ListChecks className="h-3 w-3" />
                          {p.total > 0 ? `${p.pct}%` : "Tarefas"}
                        </span>
                        <span className="block text-muted-foreground">
                          {p.total > 0 ? `${p.done}/${p.total} tarefas` : "adicionar"}
                        </span>
                        {p.total > 0 && (
                          <span className="mt-1 block h-1 w-full rounded-full bg-muted">
                            <span
                              className="block h-1 rounded-full bg-primary transition-all"
                              style={{ width: `${p.pct}%` }}
                            />
                          </span>
                        )}
                      </button>
                    );
                  })()}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-4">
        Clique numa etapa para avançar até ela. Clique numa etapa concluída para retroceder.
      </p>

      <StageTasksDialog
        stage={openStage}
        onOpenChange={(o) => !o && setOpenStage(null)}
        tasks={openStage ? (tasksByStage.get(openStage.id) ?? []) : []}
        loading={stageTasksQ.isLoading}
        onToggle={(task_id, done) => doneTaskM.mutate({ task_id, done })}
        onAdd={(title, due_date) =>
          openStage && addTaskM.mutate({ stage_id: openStage.id, title, due_date })
        }
        adding={addTaskM.isPending}
      />

      <EditStagesDialog
        open={editing}
        onOpenChange={setEditing}
        stages={
          stages.length
            ? stages.map((s) => ({
                id: s.id,
                name: s.name,
                due_date: s.due_date,
                status: s.status,
                percent: s.percent,
              }))
            : DEFAULT_STAGES
        }
        onSave={(next) => {
          saveM.mutate(next);
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
  stages: Draft[];
  onSave: (next: Draft[]) => void;
}) {
  const [draft, setDraft] = useState<Draft[]>(stages);

  useEffect(() => {
    if (open) setDraft(stages.map((s) => ({ ...s })));
  }, [open, stages]);

  function update(idx: number, patch: Partial<Draft>) {
    setDraft((d) => d.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function remove(idx: number) {
    setDraft((d) => d.filter((_, i) => i !== idx));
  }
  function add() {
    setDraft((d) => [...d, { name: "Nova etapa", due_date: null, status: "not_started", percent: 0 }]);
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar etapas do roadmap</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto py-1">
          {draft.map((s, i) => (
            <div key={s.id ?? `new-${i}`} className="flex items-center gap-2">
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
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Nome da etapa"
              />
              <Input
                type="date"
                className="w-[9.5rem] shrink-0"
                value={s.due_date ?? ""}
                onChange={(e) => update(i, { due_date: e.target.value || null })}
                aria-label="Prazo da etapa"
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

function StageTasksDialog({
  stage,
  onOpenChange,
  tasks,
  loading,
  onToggle,
  onAdd,
  adding,
}: {
  stage: ProjectStage | null;
  onOpenChange: (o: boolean) => void;
  tasks: StageTask[];
  loading: boolean;
  onToggle: (taskId: string, done: boolean) => void;
  onAdd: (title: string, dueDate: string | null) => void;
  adding: boolean;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const done = tasks.filter((t) => t.status === "concluido").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  function submit() {
    const t = title.trim();
    if (!t) {
      toast.error("Informe o título da tarefa");
      return;
    }
    onAdd(t, due || null);
    setTitle("");
    setDue("");
  }

  return (
    <Dialog open={!!stage} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tarefas — {stage?.name}</DialogTitle>
        </DialogHeader>

        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>
              {done} de {tasks.length} concluídas
            </span>
            <span className="font-semibold text-foreground">{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="space-y-1 max-h-[45vh] overflow-y-auto py-1">
          {loading ? (
            <p className="text-xs text-muted-foreground">Carregando tarefas...</p>
          ) : tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma tarefa nesta etapa. Adicione abaixo — ela aparece também na Central de Execuções.
            </p>
          ) : (
            tasks.map((t) => {
              const isDone = t.status === "concluido";
              return (
                <label
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40 cursor-pointer"
                >
                  <Checkbox
                    checked={isDone}
                    onCheckedChange={(v) => onToggle(t.id, v === true)}
                  />
                  <span className={["flex-1 text-sm", isDone ? "line-through text-muted-foreground" : ""].join(" ")}>
                    {t.title}
                  </span>
                  {t.due_date && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {new Date(t.due_date).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-2 border-t pt-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Nova tarefa desta etapa"
          />
          <Input
            type="date"
            className="w-[9.5rem] shrink-0"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Prazo da tarefa"
          />
          <Button onClick={submit} disabled={adding} size="icon" aria-label="Adicionar tarefa">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
