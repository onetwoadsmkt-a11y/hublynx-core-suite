import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  GripVertical,
  LayoutTemplate,
  ListChecks,
  UserRound,
  Users,
  Rows3,
  Columns3,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectAccess } from "@/components/projects/ProjectTeamPanel";
import {
  listProjectStages,
  saveProjectStages,
  setStageProgress,
  listProjectTemplates,
  applyTemplateToProject,
  listProjectStageTasks,
  addProjectStageTask,
  setProjectStageTaskDone,
  setStageTaskClient,
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
  const clientFlagFn = useServerFn(setStageTaskClient);
  const [editing, setEditing] = useState(false);
  const [openStage, setOpenStage] = useState<ProjectStage | null>(null);
  // vertical: etapas abertas na própria lista
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const accessQ = useProjectAccess(projectId);
  // só quem foi liberado no projeto pode ser responsável por tarefas
  const assignees: Assignee[] = (accessQ.data?.members ?? [])
    .filter(
      (m) =>
        m.user_id &&
        // equipe que executa + o cliente (executa as tarefas dele pelo portal)
        ["gestor", "editor", "executor", "cliente"].includes(m.access_role) &&
        m.status === "active",
    )
    .map((m) => ({
      id: m.user_id as string,
      name: m.name || m.email || "Sem nome",
      role: m.access_role,
    }));
  const canManageTeam = accessQ.data?.canManage ?? false;
  const [view, setView] = useState<"vertical" | "horizontal">("vertical");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("core_project_roadmap_view");
      if (saved === "vertical" || saved === "horizontal") setView(saved);
    } catch {
      // A visualização continua disponível quando o armazenamento é bloqueado.
    }
  }, []);

  function changeView(next: "vertical" | "horizontal") {
    setView(next);
    try {
      localStorage.setItem("core_project_roadmap_view", next);
    } catch {
      // A escolha ainda é mantida durante esta visita.
    }
  }

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
    // "Seu dia" do Hub Central também mostra estas tarefas
    qc.invalidateQueries({ queryKey: ["hub-today"] });
    // Agenda também exibe estas tarefas quando têm data
    qc.invalidateQueries({ queryKey: ["agenda"] });
  };

  const clientFlagM = useMutation({
    mutationFn: (v: TaskPatch) => clientFlagFn({ data: v }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const addTaskM = useMutation({
    mutationFn: (v: {
      stage_id: string;
      title: string;
      due_date: string | null;
      responsible_type: "equipe" | "cliente";
      assignee_id: string | null;
    }) => addTaskFn({ data: { project_id: projectId, ...v } }),
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
    return {
      total: list.length,
      done,
      pct: list.length ? Math.round((done / list.length) * 100) : 0,
    };
  };

  return (
    <Card className="rounded-2xl p-5">
      <div className="mb-4 grid min-w-0 gap-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm">Roadmap do Projeto</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {doneCount} de {total} etapas concluídas — {percent}%
            </p>
          </div>
          <div
            role="group"
            aria-label="Visualização do roadmap"
            className="flex shrink-0 items-center gap-1 rounded-lg border bg-muted/50 p-1"
          >
            {(
              [
                { value: "vertical", label: "Vertical", icon: Rows3 },
                { value: "horizontal", label: "Horizontal", icon: Columns3 },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={view === value ? "secondary" : "ghost"}
                size="sm"
                onClick={() => changeView(value)}
                aria-pressed={view === value}
                aria-label={label}
                title={label}
                className="shrink-0 px-2 sm:px-3"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </Button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
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
                      if (total > 0 && !confirm("Isso substitui as etapas atuais. Continuar?"))
                        return;
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
      ) : view === "vertical" ? (
        <ol className="space-y-3" aria-label="Etapas do projeto">
          {stages.map((s, i) => {
            const isDone = s.status === "done";
            const isCurrent = !isDone && i === currentIdx;
            const taskProgress = stageProgress(s.id);
            const statusLabel = {
              not_started: "Não iniciada",
              in_progress: "Em andamento",
              waiting: "Aguardando",
              blocked: "Bloqueada",
              done: "Concluída",
            }[s.status];
            return (
              <li key={s.id} className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] gap-3 sm:gap-4">
                <div className="flex flex-col items-center">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      progressM.mutate({ stage_id: s.id, status: isDone ? "not_started" : "done" })
                    }
                    disabled={progressM.isPending}
                    className={`z-10 h-9 w-9 shrink-0 rounded-full border-2 ${isDone ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : isCurrent ? "border-primary text-primary ring-4 ring-primary/15" : "border-border text-muted-foreground"}`}
                    aria-label={`Etapa ${s.name}`}
                    title={isDone ? "Retroceder etapa" : "Avançar etapa"}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                  </Button>
                  {i < total - 1 && (
                    <span className={`mt-1 w-0.5 flex-1 ${isDone ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
                <div
                  className={`min-w-0 rounded-lg border bg-background p-4 ${isCurrent ? "border-primary/50" : "border-border"}`}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <h4 className="break-words text-sm font-semibold">
                        {i + 1}. {s.name}
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {statusLabel}
                        {s.due_date ? ` · Prazo: ${s.due_date.split("-").reverse().join("/")}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-primary">
                      {s.percent}%
                    </span>
                  </div>
                  <Progress
                    value={s.percent}
                    aria-label={`Progresso da etapa ${s.name}`}
                    className="mt-3 h-1.5"
                  />
                  <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {taskProgress.total > 0
                          ? `${taskProgress.done}/${taskProgress.total} tarefas concluídas · ${taskProgress.pct}%`
                          : "Nenhuma tarefa"}
                      </p>
                      {taskProgress.total > 0 && (
                        <Progress
                          value={taskProgress.pct}
                          aria-label={`Progresso das tarefas de ${s.name}`}
                          className="mt-2 h-1"
                        />
                      )}
                    </div>
                    <Button
                      variant={expanded.has(s.id) ? "secondary" : "outline"}
                      size="sm"
                      onClick={() =>
                        setExpanded((cur) => {
                          const n = new Set(cur);
                          if (n.has(s.id)) n.delete(s.id);
                          else n.add(s.id);
                          return n;
                        })
                      }
                      className="shrink-0"
                      aria-expanded={expanded.has(s.id)}
                      aria-label={`Tarefas da etapa ${s.name}`}
                    >
                      {expanded.has(s.id) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {expanded.has(s.id) ? "Fechar" : "Abrir tarefas"}
                    </Button>
                  </div>
                  {expanded.has(s.id) && (
                    <div className="mt-4 border-t pt-4">
                      <StageTasksPanel
                        tasks={tasksByStage.get(s.id) ?? []}
                        loading={stageTasksQ.isLoading}
                        assignees={assignees}
                        canManageTeam={canManageTeam}
                        onToggle={(task_id, done) => doneTaskM.mutate({ task_id, done })}
                        onPatch={(v) => clientFlagM.mutate(v)}
                        onAdd={(title, due_date, who) =>
                          addTaskM.mutate({
                            stage_id: s.id,
                            title,
                            due_date: due_date ?? s.due_date ?? null,
                            ...responsibleFrom(who),
                          })
                        }
                        adding={addTaskM.isPending}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="relative" style={{ minWidth: total * 120 }}>
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
                        progressM.mutate({
                          stage_id: s.id,
                          status: isDone ? "not_started" : "done",
                        })
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
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-4">
        Clique numa etapa para avançar até ela. Clique numa etapa concluída para retroceder. Quando
        todas as tarefas de uma etapa são concluídas, ela é concluída sozinha.
      </p>

      <StageTasksDialog
        stage={openStage}
        onOpenChange={(o) => !o && setOpenStage(null)}
        tasks={openStage ? (tasksByStage.get(openStage.id) ?? []) : []}
        loading={stageTasksQ.isLoading}
        assignees={assignees}
        canManageTeam={canManageTeam}
        onToggle={(task_id, done) => doneTaskM.mutate({ task_id, done })}
        onPatch={(v) => clientFlagM.mutate(v)}
        onAdd={(title, due_date, who) =>
          openStage &&
          addTaskM.mutate({
            stage_id: openStage.id,
            title,
            // sem data informada, usa a data da etapa para aparecer na Agenda
            due_date: due_date ?? openStage.due_date ?? null,
            ...responsibleFrom(who),
          })
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
    setDraft((d) => [
      ...d,
      { name: "Nova etapa", due_date: null, status: "not_started", percent: 0 },
    ]);
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
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === draft.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs leading-none"
                  aria-label="Mover para baixo"
                >
                  ▼
                </button>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Assignee = { id: string; name: string; role: string };
type TaskPatch = {
  task_id: string;
  responsible_type?: "equipe" | "cliente";
  visible_to_client?: boolean;
  assignee_id?: string | null;
};
/**
 * Valor do seletor de responsável: "equipe" (sem pessoa), "u:<id>" (pessoa da equipe),
 * "c:<id>" (cliente que executa pelo portal) ou "cliente" (cliente ainda não convidado).
 */
type Who = string;

function responsibleFrom(who: Who): {
  responsible_type: "equipe" | "cliente";
  assignee_id: string | null;
} {
  if (who === "cliente") return { responsible_type: "cliente", assignee_id: null };
  if (who.startsWith("c:")) return { responsible_type: "cliente", assignee_id: who.slice(2) };
  if (who.startsWith("u:")) return { responsible_type: "equipe", assignee_id: who.slice(2) };
  return { responsible_type: "equipe", assignee_id: null };
}

const ROLE_SHORT: Record<string, string> = {
  gestor: "Gestor",
  editor: "Editor",
  executor: "Executor",
};

function ResponsibleSelect({
  value,
  onChange,
  assignees,
  canManageTeam,
  className,
  compact = false,
}: {
  value: Who;
  onChange: (v: Who) => void;
  assignees: Assignee[];
  canManageTeam: boolean;
  className?: string;
  compact?: boolean;
}) {
  const team = assignees.filter((a) => a.role !== "cliente");
  const clients = assignees.filter((a) => a.role === "cliente");
  const isClient = value === "cliente" || value.startsWith("c:");
  const current =
    value.startsWith("u:") || value.startsWith("c:")
      ? assignees.find((a) => value === `${a.role === "cliente" ? "c" : "u"}:${a.id}`)
      : null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={className}
        aria-label="Responsável pela tarefa"
        title="Responsável pela tarefa"
      >
        <SelectValue>
          <span className="flex min-w-0 items-center gap-1.5">
            {isClient ? (
              <UserRound className="h-3.5 w-3.5 shrink-0 text-amber-700" />
            ) : (
              <Users className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">
              {current
                ? isClient
                  ? `${current.name} (cliente)`
                  : current.name
                : value === "cliente"
                  ? "Cliente"
                  : value.startsWith("u:") || value.startsWith("c:")
                    ? "Pessoa sem permissão"
                    : compact
                      ? "Responsável"
                      : "Equipe (sem responsável)"}
            </span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Equipe do projeto</SelectLabel>
          {team.map((a) => (
            <SelectItem key={a.id} value={`u:${a.id}`}>
              {a.name}
              <span className="ml-1 text-muted-foreground">· {ROLE_SHORT[a.role] ?? a.role}</span>
            </SelectItem>
          ))}
          {team.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Ninguém liberado ainda.{" "}
              {canManageTeam
                ? "Libere pessoas em Equipe e permissões."
                : "Peça ao gestor do projeto."}
            </p>
          )}
          <SelectItem value="equipe">Equipe (sem responsável)</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Cliente — executa pelo portal</SelectLabel>
          {clients.map((a) => (
            <SelectItem key={a.id} value={`c:${a.id}`}>
              {a.name}
              <span className="ml-1 text-muted-foreground">· Cliente</span>
            </SelectItem>
          ))}
          {clients.length === 0 && (
            <SelectItem value="cliente">Cliente (ainda não convidado)</SelectItem>
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

type StageTasksProps = {
  stage: ProjectStage;
  tasks: StageTask[];
  loading: boolean;
  assignees: Assignee[];
  canManageTeam: boolean;
  onToggle: (taskId: string, done: boolean) => void;
  onPatch: (v: TaskPatch) => void;
  onAdd: (title: string, dueDate: string | null, who: Who) => void;
  adding: boolean;
};

/** Lista de tarefas da etapa + inclusão com responsável (usada na lista vertical e na janela). */
function StageTasksPanel({
  tasks,
  loading,
  assignees,
  canManageTeam,
  onToggle,
  onPatch,
  onAdd,
  adding,
  scroll = false,
}: Omit<StageTasksProps, "stage"> & { scroll?: boolean }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [who, setWho] = useState<Who>("equipe");
  const pending = tasks.filter((t) => t.status !== "concluido");
  const finished = tasks.filter((t) => t.status === "concluido");

  function submit() {
    const t = title.trim();
    if (!t) {
      toast.error("Informe o título da tarefa");
      return;
    }
    onAdd(t, due || null, who);
    setTitle("");
    setDue("");
  }

  const rowProps = { onToggle, onPatch, assignees, canManageTeam };
  return (
    <div className={scroll ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-3"}>
      <div className={scroll ? "min-h-0 flex-1 space-y-1 overflow-y-auto py-1" : "space-y-1"}>
        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando tarefas...</p>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma tarefa nesta etapa. Adicione abaixo — ela aparece também na Central de
            Execuções.
          </p>
        ) : (
          <>
            {pending.map((t) => (
              <StageTaskRow key={t.id} t={t} {...rowProps} />
            ))}
            {pending.length === 0 && (
              <p className="px-2 py-1 text-xs text-emerald-700">
                Todas as tarefas desta etapa foram concluídas.
              </p>
            )}
            {finished.length > 0 && (
              <details className="mt-2" open={finished.length <= 3}>
                <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-muted-foreground">
                  Concluídas ({finished.length})
                </summary>
                {finished.map((t) => (
                  <StageTaskRow key={t.id} t={t} {...rowProps} />
                ))}
              </details>
            )}
          </>
        )}
      </div>

      <div className="grid shrink-0 gap-2 rounded-lg border bg-muted/30 p-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_13rem_auto]">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Nova tarefa desta etapa"
          className="bg-background"
        />
        <Input
          type="date"
          className="bg-background"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Prazo da tarefa"
        />
        <ResponsibleSelect
          value={who}
          onChange={setWho}
          assignees={assignees}
          canManageTeam={canManageTeam}
          className="h-9 bg-background"
        />
        <Button onClick={submit} disabled={adding} className="h-9">
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
    </div>
  );
}

function StageTasksDialog({
  stage,
  onOpenChange,
  ...rest
}: Omit<StageTasksProps, "stage"> & {
  stage: ProjectStage | null;
  onOpenChange: (o: boolean) => void;
}) {
  const tasks = rest.tasks;
  const done = tasks.filter((t) => t.status === "concluido").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return (
    <Dialog open={!!stage} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-4 overflow-hidden p-5">
        <DialogHeader>
          <DialogTitle className="pr-8">Tarefas — {stage?.name}</DialogTitle>
        </DialogHeader>
        <div className="shrink-0">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {done} de {tasks.length} concluídas
            </span>
            <span className="font-semibold text-foreground">{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <StageTasksPanel {...rest} scroll />
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StageTaskRow({
  t,
  onToggle,
  onPatch,
  assignees,
  canManageTeam,
}: {
  t: StageTask;
  onToggle: (taskId: string, done: boolean) => void;
  onPatch: (v: TaskPatch) => void;
  assignees: Assignee[];
  canManageTeam: boolean;
}) {
  const isDone = t.status === "concluido";
  const isClient = t.responsible_type === "cliente";
  const who: Who = isClient
    ? t.assignee_id
      ? `c:${t.assignee_id}`
      : "cliente"
    : t.assignee_id
      ? `u:${t.assignee_id}`
      : "equipe";
  return (
    <div
      className={[
        "flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 sm:flex-nowrap",
        isDone ? "bg-accent/50" : "hover:bg-accent/40",
      ].join(" ")}
    >
      <Checkbox
        checked={isDone}
        onCheckedChange={(v) => onToggle(t.id, v === true)}
        aria-label="Concluir tarefa"
      />
      <span
        className={[
          "min-w-0 flex-1 text-sm",
          isDone ? "text-muted-foreground line-through" : "",
        ].join(" ")}
      >
        {t.title}
      </span>
      <ResponsibleSelect
        value={who}
        onChange={(v) => {
          const r = responsibleFrom(v);
          onPatch({
            task_id: t.id,
            responsible_type: r.responsible_type,
            assignee_id: r.assignee_id,
          });
        }}
        assignees={assignees}
        canManageTeam={canManageTeam}
        compact
        className={[
          "h-7 w-[11rem] shrink-0 rounded-full px-2.5 text-[11px] font-medium",
          isClient ? "border-amber-300 bg-amber-50 text-amber-800" : "",
        ].join(" ")}
      />
      {!isClient && (
        <button
          type="button"
          onClick={() => onPatch({ task_id: t.id, visible_to_client: !t.visible_to_client })}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={
            t.visible_to_client ? "O cliente acompanha esta tarefa no portal" : "Oculta do cliente"
          }
          aria-label="Visível para o cliente"
        >
          {t.visible_to_client ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      {t.due_date && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {new Date(t.due_date).toLocaleDateString("pt-BR")}
        </span>
      )}
    </div>
  );
}
