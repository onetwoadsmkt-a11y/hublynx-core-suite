import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  Paperclip,
  X,
  CalendarClock,
  CalendarRange,
  AlertTriangle,
  Globe,
  Lock,
  MessageSquare,
  Send,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { TaskAttachments } from "@/components/projects/TaskAttachments";
import {
  ACCEPT_ATTACHMENTS,
  MAX_ATTACHMENT_MB,
  attachmentDownloadUrl,
  listProjectAttachments,
  removeTaskAttachment,
  retryAttachmentDrive,
  uploadTaskAttachment,
  type TaskAttachment,
} from "@/lib/projects/attachments.functions";
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
  setStageTaskDates,
  rescheduleProject,
  shiftProjectStages,
  type ProjectStage,
  type StageTask,
} from "@/lib/projects/stages.functions";

/** Arquivos das tarefas do projeto (lista + ações), compartilhados pelas linhas. */
type AttachCtx = {
  byTask: Map<string, TaskAttachment[]>;
  upload: (taskId: string, file: File, note: string) => Promise<unknown>;
  open: (id: string) => Promise<string>;
  remove: (id: string) => Promise<unknown>;
  retry: (id: string) => Promise<unknown>;
  canManage: boolean;
};
const AttachmentsContext = createContext<AttachCtx | null>(null);

/** Mensagem de uma tarefa (equipe interna ou visível ao cliente no portal). */
type TaskMessage = {
  id: string;
  task_id: string;
  body: string;
  created_at: string;
  owner_id: string;
  visibility: "equipe" | "cliente";
  author_kind: "equipe" | "cliente";
  author: string;
};

/** Permissões, mensagens e datas das tarefas, compartilhadas pelas linhas. */
type TaskCtx = {
  meId: string | null;
  /** quem pode mexer em qualquer tarefa (gestor/editor/admin); executor só nas dele */
  canEditAll: boolean;
  canEditTask: (t: StageTask) => boolean;
  messages: Map<string, TaskMessage[]>;
  sendMessage: (t: StageTask, body: string, visibility: "equipe" | "cliente") => Promise<void>;
  saveDates: (taskId: string, start: string | null, due: string | null) => Promise<void>;
  highlightId: string | null;
};
const TaskContext = createContext<TaskCtx | null>(null);

const plain = (body: string) =>
  /<[a-z][\s\S]*>/i.test(body) ? body.replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim() : body;

type Draft = {
  id?: string;
  name: string;
  start_date?: string | null;
  due_date: string | null;
  status: ProjectStage["status"];
  percent: number;
  phase?: string | null;
  week_label?: string | null;
  alert?: string | null;
};

const fmtBr = (d: string | null | undefined) =>
  d ? d.slice(0, 10).split("-").reverse().join("/") : null;
const fmtShort = (d: string | null | undefined) =>
  d ? d.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : null;
function rangeLabel(start: string | null | undefined, due: string | null | undefined) {
  if (start && due) return `${fmtShort(start)} a ${fmtBr(due)}`;
  if (due) return `Prazo: ${fmtBr(due)}`;
  if (start) return `Início: ${fmtBr(start)}`;
  return null;
}

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
  focusTaskId = null,
}: {
  projectId: string;
  /** Mantido por compatibilidade: etapas antigas em JSONB não são mais usadas. */
  stages?: unknown;
  disabled?: boolean;
  disabledMessage?: string;
  /** tarefa vinda de um aviso: abre a etapa e destaca a tarefa */
  focusTaskId?: string | null;
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
  const canEditAll = !!(accessQ.data?.canEdit || accessQ.data?.isOrgAdmin);
  const meQ = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: Infinity,
  });
  const meId = meQ.data ?? null;
  const [view, setView] = useState<"vertical" | "horizontal">("vertical");
  const isMobile = useIsMobile();
  // computador (≥1024px): etapas em trilha à esquerda e tarefas em cartões
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIsWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  // no celular o roadmap é sempre vertical (etapas empilhadas)
  const effectiveView = isMobile ? "vertical" : view;
  const [taskFilter, setTaskFilter] = useState<"todas" | "minhas" | "atrasadas">("todas");

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
    qc.invalidateQueries({ queryKey: ["project-journey", projectId] });
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

  // arquivos das tarefas (cópia no Google Drive feita pelo servidor)
  const attachListFn = useServerFn(listProjectAttachments);
  const attachUploadFn = useServerFn(uploadTaskAttachment);
  const attachUrlFn = useServerFn(attachmentDownloadUrl);
  const attachRemoveFn = useServerFn(removeTaskAttachment);
  const attachRetryFn = useServerFn(retryAttachmentDrive);
  const attachQ = useQuery({
    queryKey: ["project-attachments", projectId],
    queryFn: () => attachListFn({ data: { projectId } }),
    enabled: !disabled,
    staleTime: 30_000,
  });
  const refreshAttachments = () => {
    qc.invalidateQueries({ queryKey: ["project-attachments", projectId] });
    qc.invalidateQueries({ queryKey: ["project-journey", projectId] });
  };
  async function uploadTo(taskId: string, file: File, note: string) {
    const fd = new FormData();
    fd.append("taskId", taskId);
    fd.append("file", file);
    if (note.trim()) fd.append("note", note.trim());
    const out = await attachUploadFn({ data: fd });
    refreshAttachments();
    if (out.drive.status === "ok") toast.success("Arquivo anexado e copiado para o Google Drive.");
    else toast.warning(`Arquivo anexado. Cópia no Drive pendente: ${out.drive.error ?? ""}`);
    return out;
  }
  const attachCtx = useMemo<AttachCtx>(() => {
    const byTask = new Map<string, TaskAttachment[]>();
    for (const a of attachQ.data ?? [])
      byTask.set(a.task_id, [...(byTask.get(a.task_id) ?? []), a]);
    return {
      byTask,
      upload: uploadTo,
      open: async (id) => (await attachUrlFn({ data: { id } })).url,
      remove: async (id) => {
        await attachRemoveFn({ data: { id } });
        toast.success("Arquivo removido da tarefa (fica no histórico).");
        refreshAttachments();
      },
      retry: async (id) => {
        const r = await attachRetryFn({ data: { id } });
        if (r.status === "ok") toast.success("Copiado para o Google Drive.");
        else toast.error(r.error ?? "Não foi possível copiar para o Drive.");
        refreshAttachments();
      },
      canManage: canManageTeam,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachQ.data, canManageTeam]);

  const addTaskM = useMutation({
    mutationFn: async (v: {
      stage_id: string;
      title: string;
      due_date: string | null;
      responsible_type: "equipe" | "cliente";
      assignee_id: string | null;
      file?: File | null;
    }) => {
      const { file, ...task } = v;
      const out = await addTaskFn({ data: { project_id: projectId, ...task } });
      if (file && out.id) await uploadTo(out.id, file, "");
      return out;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const doneTaskM = useMutation({
    mutationFn: (v: { task_id: string; done: boolean }) => doneTaskFn({ data: v }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const rescheduleFn = useServerFn(rescheduleProject);
  const shiftFn = useServerFn(shiftProjectStages);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [shiftStage, setShiftStage] = useState<ProjectStage | null>(null);
  const rescheduleM = useMutation({
    mutationFn: (start_date: string) =>
      rescheduleFn({ data: { project_id: projectId, start_date } }),
    onSuccess: (r) => {
      toast.success(
        `Cronograma recalculado: ${r.stages} etapa(s) e ${r.tasks} tarefa(s) em aberto.`,
      );
      invalidate();
      setScheduleOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const shiftM = useMutation({
    mutationFn: (v: { stage_id: string; days: number; following: boolean }) =>
      shiftFn({ data: { project_id: projectId, ...v } }),
    onSuccess: (r, v) => {
      toast.success(
        `${v.days > 0 ? "Adiado" : "Adiantado"} ${Math.abs(v.days)} dia(s): ${r.stages} etapa(s), ${r.tasks} tarefa(s).`,
      );
      invalidate();
      setShiftStage(null);
    },
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
            start_date: s.start_date ?? null,
            due_date: s.due_date,
            status: s.status,
            percent: s.percent,
            phase: s.phase ?? null,
            week_label: s.week_label ?? null,
            alert: s.alert ?? null,
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

  // Mensagens das tarefas do projeto
  const taskIds = useMemo(() => (stageTasksQ.data ?? []).map((t) => t.id), [stageTasksQ.data]);
  const messagesQ = useQuery({
    queryKey: ["project-task-messages", projectId, taskIds.length],
    enabled: !disabled && taskIds.length > 0,
    staleTime: 20_000,
    queryFn: async (): Promise<TaskMessage[]> => {
      const rows: any[] = [];
      for (let i = 0; i < taskIds.length; i += 150) {
        const chunk = taskIds.slice(i, i + 150);
        let r: any = await supabase
          .from("task_comments")
          .select("id, task_id, body, created_at, owner_id, visibility, author_kind" as any)
          .in("task_id", chunk)
          .order("created_at");
        // sem a migração 23 não existem destino/autor: tudo conta como da equipe
        if (r.error) r = await supabase.from("task_comments").select("id, task_id, body, created_at, owner_id").in("task_id", chunk).order("created_at");
        rows.push(...((r.data ?? []) as any[]));
      }
      const owners = [...new Set(rows.map((m) => m.owner_id))];
      const names = new Map<string, string>();
      if (owners.length) {
        const { data } = await supabase.from("profiles").select("id, full_name").in("id", owners);
        for (const p of (data ?? []) as any[]) names.set(p.id, p.full_name);
      }
      return rows.map((m) => ({
        ...m,
        visibility: m.visibility ?? "equipe",
        author_kind: m.author_kind ?? "equipe",
        author: names.get(m.owner_id) || (m.author_kind === "cliente" ? "Cliente" : "Equipe"),
      }));
    },
  });
  const datesFn = useServerFn(setStageTaskDates);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const taskCtx = useMemo<TaskCtx>(() => {
    const messages = new Map<string, TaskMessage[]>();
    for (const m of messagesQ.data ?? []) messages.set(m.task_id, [...(messages.get(m.task_id) ?? []), m]);
    return {
      meId,
      canEditAll,
      canEditTask: (t) => canEditAll || (!!meId && t.assignee_id === meId),
      messages,
      highlightId,
      sendMessage: async (t, body, visibility) => {
        const vis = visibility;
        if (vis === "cliente" && !t.visible_to_client && t.responsible_type !== "cliente") {
          const { error: vErr } = await supabase.from("tasks").update({ visible_to_client: true } as never).eq("id", t.id);
          if (vErr) throw new Error(vErr.message);
        }
        let { error } = await supabase.from("task_comments").insert({
          task_id: t.id, owner_id: meId, body, visibility: vis, author_kind: "equipe",
        } as never);
        if (error && /visibility|author_kind/.test(error.message)) {
          ({ error } = await supabase.from("task_comments").insert({ task_id: t.id, owner_id: meId, body } as never));
        }
        if (error) throw new Error(error.message);
        qc.invalidateQueries({ queryKey: ["project-task-messages", projectId] });
        qc.invalidateQueries({ queryKey: ["project-journey", projectId] });
        if (vis === "cliente") qc.invalidateQueries({ queryKey: ["project-stage-tasks", projectId] });
      },
      saveDates: async (taskId, start, due) => {
        await datesFn({ data: { task_id: taskId, start_date: start, due_date: due } });
        invalidate();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesQ.data, meId, canEditAll, highlightId, projectId]);

  // Chegou por um aviso: abre a etapa da tarefa e rola até ela
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTaskId || focusedRef.current === focusTaskId) return;
    const t = (stageTasksQ.data ?? []).find((x) => x.id === focusTaskId);
    const st = t && (stagesQ.data ?? []).find((x) => x.id === t.stage_id);
    if (!t || !st) return;
    focusedRef.current = focusTaskId;
    setSelectedStageId(st.id);
    if (effectiveView === "vertical") setExpanded((cur) => new Set(cur).add(st.id));
    else setOpenStage(st);
    setHighlightId(t.id);
    const tryScroll = (n: number) => {
      const el = document.getElementById(`stage-task-${t.id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      else if (n > 0) setTimeout(() => tryScroll(n - 1), 150);
    };
    setTimeout(() => tryScroll(10), 100);
    const off = setTimeout(() => setHighlightId(null), 6000);
    return () => clearTimeout(off);
  }, [focusTaskId, stageTasksQ.data, stagesQ.data, effectiveView]);

  // Abre a etapa atual na primeira carga (sem aviso de tarefa)
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || focusTaskId || !stagesQ.data?.length) return;
    autoOpened.current = true;
    const cur = stagesQ.data.find((x) => x.status !== "done");
    if (cur) setExpanded((c) => new Set(c).add(cur.id));
  }, [stagesQ.data, focusTaskId]);

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
  const todayStart = new Date(new Date().toDateString()).getTime();
  const isLate = (t: StageTask) =>
    t.status !== "concluido" && t.status !== "cancelado" && !!t.due_date && new Date(t.due_date).getTime() < todayStart;
  const myCount = allStageTasks.filter((t) => meId && t.assignee_id === meId && t.status !== "concluido").length;
  const lateCount = allStageTasks.filter(isLate).length;
  // lista mostrada (filtro Todas / Minhas / Atrasadas); o progresso usa sempre todas
  const shownTasks = (stageId: string) => {
    const list = tasksByStage.get(stageId) ?? [];
    if (taskFilter === "minhas") return list.filter((t) => meId && t.assignee_id === meId);
    if (taskFilter === "atrasadas") return list.filter(isLate);
    return list;
  };
  const pickFilter = (f: "todas" | "minhas" | "atrasadas") => {
    setTaskFilter(f);
    if (f === "todas") return;
    // abre as etapas que têm tarefas no filtro
    const ids = stages.filter((st) => (tasksByStage.get(st.id) ?? []).some((t) => (f === "minhas" ? meId && t.assignee_id === meId : isLate(t)))).map((st) => st.id);
    setExpanded((c) => new Set([...c, ...ids]));
  };
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
    <AttachmentsContext.Provider value={attachCtx}>
      <TaskContext.Provider value={taskCtx}>
      <Card className="rounded-2xl p-3 sm:p-5">
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
              className="hidden shrink-0 items-center gap-1 rounded-lg border bg-muted/50 p-1 sm:flex"
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
          {/* Filtro das tarefas */}
          <div role="group" aria-label="Mostrar tarefas" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1 sm:max-w-md">
            {([
              ["todas", "Todas", null],
              ["minhas", "Minhas", myCount],
              ["atrasadas", "Atrasadas", lateCount],
            ] as const).map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                aria-pressed={taskFilter === k}
                onClick={() => pickFilter(k)}
                className={[
                  "h-10 rounded-lg text-[13px] font-semibold transition sm:h-8",
                  taskFilter === k ? "bg-card text-foreground shadow-sm" : k === "atrasadas" && lateCount > 0 ? "text-rose-600" : "text-muted-foreground",
                ].join(" ")}
              >
                {label}{n ? ` ${n}` : ""}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
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
            {total > 0 && (
              <Button variant="outline" size="sm" onClick={() => setScheduleOpen(true)}>
                <CalendarRange className="h-3.5 w-3.5" /> Reprogramar cronograma
              </Button>
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
        ) : isWide && effectiveView === "vertical" ? (
          (() => {
            const sel =
              stages.find((x) => x.id === selectedStageId) ??
              stages.find((x) => x.status !== "done") ??
              stages[0];
            const selIdx = stages.findIndex((x) => x.id === sel.id);
            const selProgress = stageProgress(sel.id);
            return (
              <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
                <nav
                  aria-label="Etapas do projeto"
                  className="space-y-1 rounded-2xl border bg-background p-3 lg:sticky lg:top-4"
                >
                  {stages.map((s, i) => {
                    const isDone = s.status === "done";
                    const isSel = s.id === sel.id;
                    const isCurrent = !isDone && i === currentIdx;
                    const pr = stageProgress(s.id);
                    const lateN = (tasksByStage.get(s.id) ?? []).filter(isLate).length;
                    const newPhase = !!s.phase && s.phase !== stages[i - 1]?.phase;
                    return (
                      <Fragment key={s.id}>
                        {newPhase && (
                          <p className="px-2 pb-1 pt-3 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground first:pt-1">
                            {s.phase}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedStageId(s.id)}
                          aria-current={isSel ? "step" : undefined}
                          className={[
                            "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition",
                            isSel ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-muted",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold",
                              isDone
                                ? "border-primary bg-primary text-primary-foreground"
                                : isCurrent
                                  ? "border-primary bg-background text-primary"
                                  : "border-border text-muted-foreground",
                            ].join(" ")}
                          >
                            {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm ${isSel ? "font-extrabold" : "font-semibold"}`}>{s.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {[s.week_label, pr.total ? `${pr.done}/${pr.total}` : "sem tarefas", isCurrent ? "atual" : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            {isSel && pr.total > 0 && (
                              <span className="mt-1.5 block h-1.5 rounded-full bg-primary/20">
                                <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${pr.pct}%` }} />
                              </span>
                            )}
                          </span>
                          {lateN > 0 && (
                            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`${lateN} atrasada(s)`}>
                              {lateN}
                            </span>
                          )}
                        </button>
                      </Fragment>
                    );
                  })}
                </nav>

                <section aria-label={`Tarefas da etapa ${sel.name}`} className="min-w-0 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-primary">
                        {[sel.phase, sel.week_label, rangeLabel(sel.start_date, sel.due_date)].filter(Boolean).join(" · ")}
                      </p>
                      <h4 className="mt-1 text-xl font-extrabold tracking-tight">
                        {sel.week_label ? sel.name : `${selIdx + 1}. ${sel.name}`}
                      </h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selProgress.total > 0
                          ? `${selProgress.done} de ${selProgress.total} tarefas concluídas · ${selProgress.pct}%`
                          : "Nenhuma tarefa nesta etapa"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShiftStage(sel)}>
                        <CalendarClock className="h-3.5 w-3.5" /> Datas da etapa
                      </Button>
                      <Button
                        variant={sel.status === "done" ? "outline" : "secondary"}
                        size="sm"
                        disabled={progressM.isPending}
                        onClick={() => progressM.mutate({ stage_id: sel.id, status: sel.status === "done" ? "not_started" : "done" })}
                      >
                        <Check className="h-3.5 w-3.5" /> {sel.status === "done" ? "Reabrir etapa" : "Concluir etapa"}
                      </Button>
                    </div>
                  </div>
                  {sel.alert && (
                    <p className="flex gap-1.5 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{sel.alert}</span>
                    </p>
                  )}
                  <StageTasksPanel
                    variant="cards"
                    tasks={shownTasks(sel.id)}
                    loading={stageTasksQ.isLoading}
                    assignees={assignees}
                    canManageTeam={canManageTeam}
                    onToggle={(task_id, done) => doneTaskM.mutate({ task_id, done })}
                    onPatch={(v) => clientFlagM.mutate(v)}
                    onAdd={(title, due_date, who, file) =>
                      addTaskM.mutate({
                        stage_id: sel.id,
                        title,
                        due_date: due_date ?? sel.due_date ?? null,
                        ...responsibleFrom(who),
                        file,
                      })
                    }
                    adding={addTaskM.isPending}
                  />
                </section>
              </div>
            );
          })()
        ) : effectiveView === "vertical" ? (
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
              const newPhase = !!s.phase && s.phase !== stages[i - 1]?.phase;
              const phaseStages = newPhase ? stages.filter((x) => x.phase === s.phase) : [];
              return (
                <Fragment key={s.id}>
                  {newPhase && (
                    <li className="list-none pt-2 first:pt-0">
                      <PhaseHeader name={s.phase as string} stages={phaseStages} />
                    </li>
                  )}
                  <li className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] gap-3 sm:gap-4">
                    <div className="flex flex-col items-center">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          progressM.mutate({
                            stage_id: s.id,
                            status: isDone ? "not_started" : "done",
                          })
                        }
                        disabled={progressM.isPending}
                        className={`z-10 h-9 w-9 shrink-0 rounded-full border-2 ${isDone ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : isCurrent ? "border-primary text-primary ring-4 ring-primary/15" : "border-border text-muted-foreground"}`}
                        aria-label={`Etapa ${s.name}`}
                        title={isDone ? "Retroceder etapa" : "Avançar etapa"}
                      >
                        {isDone ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                      </Button>
                      {i < total - 1 && (
                        <span
                          className={`mt-1 w-0.5 flex-1 ${isDone ? "bg-primary" : "bg-border"}`}
                        />
                      )}
                    </div>
                    <div
                      className={`min-w-0 rounded-lg border bg-background p-4 ${isCurrent ? "border-primary/50" : "border-border"}`}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                        <div className="min-w-0">
                          {s.week_label && (
                            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                              {s.week_label}
                            </p>
                          )}
                          <h4 className="break-words text-sm font-semibold">
                            {s.week_label ? s.name : `${i + 1}. ${s.name}`}
                          </h4>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span>{statusLabel}</span>
                            {rangeLabel(s.start_date, s.due_date) && (
                              <button
                                type="button"
                                onClick={() => setShiftStage(s)}
                                className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent hover:text-foreground"
                                title="Adiar ou adiantar esta etapa"
                              >
                                <CalendarClock className="h-3.5 w-3.5" />
                                {rangeLabel(s.start_date, s.due_date)}
                              </button>
                            )}
                            {!rangeLabel(s.start_date, s.due_date) && (
                              <button
                                type="button"
                                onClick={() => setShiftStage(s)}
                                className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent hover:text-foreground"
                              >
                                <CalendarClock className="h-3.5 w-3.5" /> Datas
                              </button>
                            )}
                          </p>
                          {s.alert && (
                            <p className="mt-2 flex gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{s.alert}</span>
                            </p>
                          )}
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
                            tasks={shownTasks(s.id)}
                            loading={stageTasksQ.isLoading}
                            assignees={assignees}
                            canManageTeam={canManageTeam}
                            onToggle={(task_id, done) => doneTaskM.mutate({ task_id, done })}
                            onPatch={(v) => clientFlagM.mutate(v)}
                            onAdd={(title, due_date, who, file) =>
                              addTaskM.mutate({
                                stage_id: s.id,
                                title,
                                due_date: due_date ?? s.due_date ?? null,
                                ...responsibleFrom(who),
                                file,
                              })
                            }
                            adding={addTaskM.isPending}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                </Fragment>
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
                      {(s.phase || s.week_label) && (
                        <p
                          className="w-full truncate px-1 text-center text-[10px] font-semibold text-primary"
                          title={[s.phase, s.week_label].filter(Boolean).join(" · ")}
                        >
                          {[s.phase?.split("·")[0]?.trim(), s.week_label]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {(s.start_date || s.due_date) && (
                        <button
                          type="button"
                          onClick={() => setShiftStage(s)}
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                          title="Adiar ou adiantar esta etapa"
                        >
                          {rangeLabel(s.start_date, s.due_date)}
                        </button>
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
          Clique numa etapa para avançar até ela. Clique numa etapa concluída para retroceder.
          Quando todas as tarefas de uma etapa são concluídas, ela é concluída sozinha.
        </p>

        <StageTasksDialog
          stage={openStage}
          onOpenChange={(o) => !o && setOpenStage(null)}
          tasks={openStage ? shownTasks(openStage.id) : []}
          loading={stageTasksQ.isLoading}
          assignees={assignees}
          canManageTeam={canManageTeam}
          onToggle={(task_id, done) => doneTaskM.mutate({ task_id, done })}
          onPatch={(v) => clientFlagM.mutate(v)}
          onAdd={(title, due_date, who, file) =>
            openStage &&
            addTaskM.mutate({
              stage_id: openStage.id,
              title,
              // sem data informada, usa a data da etapa para aparecer na Agenda
              due_date: due_date ?? openStage.due_date ?? null,
              ...responsibleFrom(who),
              file,
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
                  start_date: s.start_date,
                  due_date: s.due_date,
                  status: s.status,
                  percent: s.percent,
                  phase: s.phase,
                  week_label: s.week_label,
                  alert: s.alert,
                }))
              : DEFAULT_STAGES
          }
          onSave={(next) => {
            saveM.mutate(next);
            setEditing(false);
          }}
        />

        <RescheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          initial={stages.find((x) => x.start_date)?.start_date ?? null}
          pending={rescheduleM.isPending}
          onConfirm={(d) => rescheduleM.mutate(d)}
        />
        <ShiftStageDialog
          stage={shiftStage}
          isLast={!!shiftStage && stages[stages.length - 1]?.id === shiftStage.id}
          onOpenChange={(o) => !o && setShiftStage(null)}
          pending={shiftM.isPending}
          onConfirm={(days, following) =>
            shiftStage && shiftM.mutate({ stage_id: shiftStage.id, days, following })
          }
        />
      </Card>
      </TaskContext.Provider>
    </AttachmentsContext.Provider>
  );
}

/** Cabeçalho de fase: nome, período e andamento das etapas da fase. */
function PhaseHeader({ name, stages }: { name: string; stages: ProjectStage[] }) {
  const starts = stages
    .map((s) => s.start_date)
    .filter(Boolean)
    .sort() as string[];
  const dues = stages
    .map((s) => s.due_date)
    .filter(Boolean)
    .sort() as string[];
  const done = stages.filter((s) => s.status === "done").length;
  const pct = stages.length
    ? Math.round(stages.reduce((a, s) => a + (s.percent ?? 0), 0) / stages.length)
    : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">
          {starts[0] && dues.length
            ? `${fmtBr(starts[0])} a ${fmtBr(dues[dues.length - 1])} · `
            : ""}
          {done} de {stages.length} semanas concluídas
        </p>
      </div>
      <div className="flex w-32 items-center gap-2">
        <Progress value={pct} className="h-1.5" aria-label={`Andamento da ${name}`} />
        <span className="text-xs font-semibold tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

/** Nova data de início: recalcula todas as etapas e leva as tarefas em aberto junto. */
function RescheduleDialog({
  open,
  onOpenChange,
  initial,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: string | null;
  pending: boolean;
  onConfirm: (date: string) => void;
}) {
  const [date, setDate] = useState("");
  useEffect(() => {
    if (open) setDate(initial?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reprogramar cronograma</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Escolha a nova data de início do projeto. Cada etapa é recalculada pelo dia em que
            começa e pela duração dela (fases e semanas), e as tarefas em aberto vão junto. Tarefas
            concluídas não mudam.
          </p>
          <label className="grid gap-1">
            <span className="text-xs font-medium">Início do projeto (dia 1)</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!date || pending} onClick={() => onConfirm(date)}>
            Recalcular datas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Adia ou adianta uma etapa (e as seguintes, se marcado). */
function ShiftStageDialog({
  stage,
  isLast,
  onOpenChange,
  pending,
  onConfirm,
}: {
  stage: ProjectStage | null;
  isLast: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onConfirm: (days: number, following: boolean) => void;
}) {
  const [days, setDays] = useState(7);
  const [dir, setDir] = useState<1 | -1>(1);
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    if (stage) {
      setDays(7);
      setDir(1);
      setFollowing(true);
    }
  }, [stage]);
  const preview = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    d.setDate(d.getDate() + dir * (days || 0));
    return d.toLocaleDateString("pt-BR");
  };
  return (
    <Dialog open={!!stage} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Datas da etapa</DialogTitle>
        </DialogHeader>
        {stage && (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">{stage.name}</span>
              {stage.week_label ? ` · ${stage.week_label}` : ""}
              <br />
              <span className="text-muted-foreground">
                Hoje: {rangeLabel(stage.start_date, stage.due_date) ?? "sem datas"}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex rounded-lg border p-0.5"
                role="group"
                aria-label="Direção"
              >
                {(
                  [
                    [1, "Adiar"],
                    [-1, "Adiantar"],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={dir === v}
                    onClick={() => setDir(v)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${dir === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Math.max(0, Math.min(365, Number(e.target.value || 0))))}
                className="w-20"
                aria-label="Quantidade de dias"
              />
              <span className="text-muted-foreground">dias</span>
              <div className="flex gap-1">
                {[7, 14, 30].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setDays(n)}
                  >
                    {n === 7 ? "1 semana" : n === 14 ? "2 semanas" : "30 dias"}
                  </Button>
                ))}
              </div>
            </div>
            {!isLast && (
              <label className="flex items-center gap-2">
                <Checkbox checked={following} onCheckedChange={(v) => setFollowing(v === true)} />
                Levar as etapas seguintes junto (mantém a sequência do cronograma)
              </label>
            )}
            {(stage.start_date || stage.due_date) && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs">
                Nova data: {preview(stage.start_date) ?? "—"} a {preview(stage.due_date) ?? "—"}
                {following && !isLast ? " · as etapas seguintes também mudam" : ""}. As tarefas em
                aberto da etapa vão junto.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending || !days || (!stage?.start_date && !stage?.due_date)}
            onClick={() => onConfirm(dir * days, following && !isLast)}
          >
            {dir > 0 ? "Adiar" : "Adiantar"} {days} dia(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar etapas do roadmap</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">
          Fase e semana organizam o cronograma (ex.: “1ª Fase · Dias 1 a 30” e “2ª semana”). As
          datas de início e fim definem o período de cada etapa; o aviso aparece em destaque para a
          equipe e para o cliente.
        </p>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto py-1">
          {draft.map((s, i) => (
            <div key={s.id ?? `new-${i}`} className="flex gap-2 rounded-xl border p-2.5">
              <div className="flex flex-col items-center gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-xs leading-none text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Mover para cima"
                >
                  ▲
                </button>
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === draft.length - 1}
                  className="text-xs leading-none text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Mover para baixo"
                >
                  ▼
                </button>
              </div>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-6">
                <Input
                  value={s.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Nome da etapa"
                  className="sm:col-span-6"
                  aria-label="Nome da etapa"
                />
                <Input
                  value={s.phase ?? ""}
                  onChange={(e) => update(i, { phase: e.target.value || null })}
                  placeholder="Fase (opcional)"
                  className="sm:col-span-2"
                  aria-label="Fase"
                />
                <Input
                  value={s.week_label ?? ""}
                  onChange={(e) => update(i, { week_label: e.target.value || null })}
                  placeholder="Semana (opcional)"
                  className="sm:col-span-2"
                  aria-label="Semana"
                />
                <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-1">
                  <label className="grid gap-0.5 text-[11px] text-muted-foreground">
                    Início
                    <Input
                      type="date"
                      value={s.start_date ?? ""}
                      onChange={(e) => update(i, { start_date: e.target.value || null })}
                      className="h-9"
                    />
                  </label>
                  <label className="grid gap-0.5 text-[11px] text-muted-foreground">
                    Fim
                    <Input
                      type="date"
                      value={s.due_date ?? ""}
                      onChange={(e) => update(i, { due_date: e.target.value || null })}
                      className="h-9"
                    />
                  </label>
                </div>
                <Input
                  value={s.alert ?? ""}
                  onChange={(e) => update(i, { alert: e.target.value || null })}
                  placeholder="Aviso importante desta etapa (opcional)"
                  className="sm:col-span-6"
                  aria-label="Aviso"
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => remove(i)}
                className="shrink-0 text-rose-600 hover:text-rose-700"
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
  disabled = false,
}: {
  value: Who;
  onChange: (v: Who) => void;
  assignees: Assignee[];
  canManageTeam: boolean;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const team = assignees.filter((a) => a.role !== "cliente");
  const clients = assignees.filter((a) => a.role === "cliente");
  const isClient = value === "cliente" || value.startsWith("c:");
  const current =
    value.startsWith("u:") || value.startsWith("c:")
      ? assignees.find((a) => value === `${a.role === "cliente" ? "c" : "u"}:${a.id}`)
      : null;
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
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
  onAdd: (title: string, dueDate: string | null, who: Who, file: File | null) => void;
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
  variant = "rows",
}: Omit<StageTasksProps, "stage"> & { scroll?: boolean; variant?: "rows" | "cards" }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [who, setWho] = useState<Who>("equipe");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = tasks.filter((t) => t.status !== "concluido");
  const finished = tasks.filter((t) => t.status === "concluido");

  function submit() {
    const t = title.trim();
    if (!t) {
      toast.error("Informe o título da tarefa");
      return;
    }
    onAdd(t, due || null, who, file);
    setTitle("");
    setDue("");
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  const rowProps = { onToggle, onPatch, assignees, canManageTeam };
  const ctx = useContext(TaskContext);
  const canAdd = ctx ? ctx.canEditAll : true;
  return (
    <div className={scroll ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-3"}>
      <div className={scroll ? "min-h-0 flex-1 space-y-1 overflow-y-auto py-1" : "space-y-1"}>
        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando tarefas...</p>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma tarefa aqui com este filtro. Adicione abaixo — ela aparece também na
            Central de Execuções.
          </p>
        ) : (
          <>
            {variant === "cards" ? (
              <div className="flex flex-col gap-3">
                {pending.map((t) => (
                  <StageTaskCard key={t.id} t={t} seq={tasks.indexOf(t) + 1} {...rowProps} />
                ))}
              </div>
            ) : (
              pending.map((t) => <StageTaskRow key={t.id} t={t} {...rowProps} />)
            )}
            {pending.length === 0 && (
              <p className="px-2 py-1 text-xs text-emerald-700">
                Todas as tarefas desta etapa foram concluídas.
              </p>
            )}
            {finished.length > 0 && (
              <details className={variant === "cards" ? "mt-4 rounded-2xl border bg-background px-3 py-2" : "mt-2"} open={variant === "cards" ? false : finished.length <= 3}>
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

      {canAdd && (
      <div className="grid shrink-0 gap-2 rounded-lg border bg-muted/30 p-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_13rem_auto]">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Nova tarefa desta etapa"
          className="h-11 bg-background text-[15px] sm:h-9 sm:text-sm"
        />
        <Input
          type="date"
          className="h-11 bg-background sm:h-9"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Prazo da tarefa"
        />
        <ResponsibleSelect
          value={who}
          onChange={setWho}
          assignees={assignees}
          canManageTeam={canManageTeam}
          className="h-11 bg-background sm:h-9"
        />
        <Button onClick={submit} disabled={adding} className="h-11 sm:h-9">
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
          {file ? (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                className="grid h-5 w-5 place-items-center rounded-full hover:bg-muted"
                aria-label="Tirar arquivo"
                onClick={() => {
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Paperclip className="h-3.5 w-3.5" /> Anexar arquivo à nova tarefa (PDF, planilha,
              imagem)
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_ATTACHMENTS}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
                toast.error(`O arquivo deve ter no máximo ${MAX_ATTACHMENT_MB} MB.`);
                e.target.value = "";
                return;
              }
              setFile(f ?? null);
            }}
          />
        </div>
      </div>
      )}
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

/** Estado da tarefa para a faixa do cartão (desktop). */
function cardState(t: StageTask) {
  if (t.status === "concluido") return { label: "Concluída", band: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300", ring: "" };
  if (t.responsible_type === "cliente")
    return { label: `Com o cliente${t.due_date ? ` · ${new Date(t.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : ""}`, band: "bg-muted text-foreground/80", ring: "" };
  if (!t.due_date) return { label: "Sem prazo", band: "bg-muted text-muted-foreground", ring: "" };
  const today = new Date(new Date().toDateString()).getTime();
  // "AAAA-MM-DD" é dia local (sem fuso); data/hora usa o dia local correspondente
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.due_date);
  const due = ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]).getTime() : new Date(new Date(t.due_date).toDateString()).getTime();
  const days = Math.round((due - today) / 86_400_000);
  if (days < 0)
    return {
      label: `Atrasada há ${Math.abs(days)} dia${Math.abs(days) > 1 ? "s" : ""}`,
      band: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-200",
      ring: "ring-2 ring-rose-500 shadow-[0_12px_32px_rgba(180,35,24,.14)]",
    };
  if (days === 0) return { label: "Vence hoje", band: "bg-[var(--task-today-bg)] text-[var(--task-today-fg)]", ring: "ring-2 ring-[var(--task-today-bg)]" };
  return { label: `Em dia · faltam ${days} dia${days > 1 ? "s" : ""}`, band: "bg-[var(--task-ontime-bg)] text-[var(--task-ontime-fg)]", ring: "" };
}

/** Cartão de tarefa em destaque (computador): faixa de estado, responsável, datas, mensagem e Concluir. */
function StageTaskCard({
  t,
  seq,
  onToggle,
  onPatch,
  assignees,
  canManageTeam,
}: {
  t: StageTask;
  seq?: number;
  onToggle: (taskId: string, done: boolean) => void;
  onPatch: (v: TaskPatch) => void;
  assignees: Assignee[];
  canManageTeam: boolean;
}) {
  const isDone = t.status === "concluido";
  const isClient = t.responsible_type === "cliente";
  const attach = useContext(AttachmentsContext);
  const ctx = useContext(TaskContext);
  const canEdit = ctx ? ctx.canEditTask(t) : true;
  const canAll = ctx ? ctx.canEditAll : true;
  const mine = !!ctx?.meId && t.assignee_id === ctx.meId;
  const highlighted = ctx?.highlightId === t.id;
  const files = attach?.byTask.get(t.id) ?? [];
  const [showFiles, setShowFiles] = useState(false);
  const st = cardState(t);
  const who: Who = isClient ? (t.assignee_id ? `c:${t.assignee_id}` : "cliente") : t.assignee_id ? `u:${t.assignee_id}` : "equipe";
  const prio = t.priority === "critica" ? "Urgente" : t.priority === "alta" ? "Alta" : null;
  return (
    <article
      id={`stage-task-${t.id}`}
      className={[
        "flex scroll-mt-24 flex-col overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(10,37,87,.06),0_12px_32px_rgba(10,37,87,.08)]",
        st.ring,
        highlighted ? "ring-4 ring-primary" : "",
      ].join(" ")}
    >
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 text-[13px] font-extrabold ${st.band}`}>
        <span>{seq ? `${seq} · ` : ""}{st.label}</span>
        <span className="flex gap-1.5">
          {prio && <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-bold">{prio}</span>}
          {mine && !isDone && <span className="rounded-full bg-[var(--brand-dark,#0a2557)] px-2 py-0.5 text-[11px] font-bold text-white">Sua</span>}
          {isClient && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">Cliente executa</span>}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            className="mt-0.5 h-6 w-6 rounded-md"
            checked={isDone}
            disabled={!canEdit}
            onCheckedChange={(v) => onToggle(t.id, v === true)}
            aria-label={canEdit ? `Concluir: ${t.title}` : "Só o responsável conclui esta tarefa"}
            title={canEdit ? undefined : "Só o responsável conclui esta tarefa"}
          />
          <div className="min-w-0">
            <h5 className={`text-[17px] font-extrabold leading-snug ${isDone ? "text-muted-foreground line-through" : ""}`}>{t.title}</h5>
            {!canEdit && !isDone && (
              <p className="mt-0.5 text-xs text-muted-foreground">{isClient ? "O cliente conclui pelo portal" : "Só o responsável conclui esta tarefa"}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ResponsibleSelect
            disabled={!canAll}
            value={who}
            onChange={(v) => {
              const r = responsibleFrom(v);
              onPatch({ task_id: t.id, responsible_type: r.responsible_type, assignee_id: r.assignee_id });
            }}
            assignees={assignees}
            canManageTeam={canManageTeam}
            compact
            className={[
              "h-8 w-auto max-w-[13rem] rounded-lg bg-muted/60 px-2.5 text-xs font-semibold",
              isClient ? "border-amber-300 bg-amber-50 text-amber-800" : "border-transparent",
            ].join(" ")}
          />
          <TaskDatesButton t={t} canEdit={canEdit} onSave={ctx?.saveDates} />
          {!isClient && (
            <button
              type="button"
              onClick={() => onPatch({ task_id: t.id, visible_to_client: !t.visible_to_client })}
              className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold ${t.visible_to_client ? "bg-amber-50 text-amber-800" : "bg-muted/60 text-muted-foreground"}`}
              title={t.visible_to_client ? "O cliente acompanha esta tarefa no portal" : "Oculta do cliente"}
            >
              {t.visible_to_client ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {t.visible_to_client ? "Visível ao cliente" : "Interna"}
            </button>
          )}
          {attach && (
            <button
              type="button"
              onClick={() => setShowFiles((v) => !v)}
              aria-expanded={showFiles}
              className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold ${files.length ? "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300" : "bg-muted/60 text-muted-foreground"}`}
            >
              <Paperclip className="h-3.5 w-3.5" /> {files.length ? `${files.length} arquivo${files.length > 1 ? "s" : ""}` : "Anexar"}
            </button>
          )}
        </div>
        {attach && showFiles && (
          <TaskAttachments
            items={files.map((a) => ({ ...a, created_at: a.uploaded_at }))}
            canUpload
            showDrive
            onUpload={(file, note) => attach.upload(t.id, file, note)}
            onOpen={attach.open}
            onRemove={(a) => attach.remove(a.id)}
            canRemove={(a) => a.mine || attach.canManage}
            onRetryDrive={attach.retry}
          />
        )}
        <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:items-end">
          {ctx && <div className="min-w-0 flex-1"><TaskMessages t={t} ctx={ctx} card /></div>}
          {canEdit && !isDone && !isClient && (
            <Button
              className="h-11 w-full shrink-0 rounded-xl bg-primary text-[15px] font-extrabold text-primary-foreground hover:bg-primary/90 sm:w-48"
              onClick={() => onToggle(t.id, true)}
            >
              <Check className="h-4 w-4" /> Concluir tarefa
            </Button>
          )}
        </div>
      </div>
    </article>
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
  const attach = useContext(AttachmentsContext);
  const ctx = useContext(TaskContext);
  const canEdit = ctx ? ctx.canEditTask(t) : true;
  const canAll = ctx ? ctx.canEditAll : true;
  const mine = !!ctx?.meId && t.assignee_id === ctx.meId;
  const highlighted = ctx?.highlightId === t.id;
  const files = attach?.byTask.get(t.id) ?? [];
  const [showFiles, setShowFiles] = useState(false);
  const who: Who = isClient
    ? t.assignee_id
      ? `c:${t.assignee_id}`
      : "cliente"
    : t.assignee_id
      ? `u:${t.assignee_id}`
      : "equipe";
  return (
    <div
      id={`stage-task-${t.id}`}
      className={[
        "scroll-mt-24 rounded-xl border transition-shadow max-sm:mb-2 max-sm:shadow-sm sm:rounded-lg sm:border-transparent",
        isDone ? "bg-accent/50" : "max-sm:bg-card sm:hover:bg-accent/40",
        highlighted ? "border-primary bg-primary/5 ring-2 ring-primary/40" : "",
        !highlighted && late(t) ? "max-sm:border-rose-200 max-sm:bg-rose-50/60" : "",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 sm:flex-nowrap sm:px-2 sm:py-1.5">
        <Checkbox
          className="h-5 w-5 sm:h-4 sm:w-4"
          checked={isDone}
          disabled={!canEdit}
          onCheckedChange={(v) => onToggle(t.id, v === true)}
          aria-label={canEdit ? "Concluir tarefa" : "Só o responsável conclui esta tarefa"}
          title={canEdit ? undefined : "Só o responsável conclui esta tarefa"}
        />
        <span
          className={[
            "min-w-0 flex-1 text-[15px] font-semibold leading-snug sm:text-sm sm:font-normal",
            isDone ? "text-muted-foreground line-through" : "",
          ].join(" ")}
        >
          {t.title}
          {mine && !isDone && (
            <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-primary">sua</span>
          )}
        </span>
        <div className="flex w-full items-center gap-1.5 pl-7 sm:contents">
        <ResponsibleSelect
          disabled={!canAll}
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
            "h-10 min-w-0 flex-1 rounded-lg px-2.5 text-xs font-medium sm:h-7 sm:w-[11rem] sm:flex-none sm:shrink-0 sm:rounded-full sm:text-[11px]",
            isClient ? "border-amber-300 bg-amber-50 text-amber-800" : "",
          ].join(" ")}
        />
        {!isClient && (
          <button
            type="button"
            onClick={() => onPatch({ task_id: t.id, visible_to_client: !t.visible_to_client })}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground max-sm:border sm:h-auto sm:w-auto"
            title={
              t.visible_to_client
                ? "O cliente acompanha esta tarefa no portal"
                : "Oculta do cliente"
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
        <TaskDatesButton t={t} canEdit={canEdit} onSave={ctx?.saveDates} />
        {attach && (
          <button
            type="button"
            onClick={() => setShowFiles((v) => !v)}
            aria-expanded={showFiles}
            className={[
              "inline-flex h-10 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] max-sm:border sm:h-7 sm:rounded-full sm:px-2",
              files.length
                ? "bg-sky-100 font-medium text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            title="Arquivos da tarefa"
            aria-label={`Arquivos da tarefa (${files.length})`}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {files.length > 0 && files.length}
          </button>
        )}
        </div>
      </div>
      {attach && showFiles && (
        <div className="px-2 pb-2.5 pl-8">
          <TaskAttachments
            items={files.map((a) => ({ ...a, created_at: a.uploaded_at }))}
            canUpload
            showDrive
            onUpload={(file, note) => attach.upload(t.id, file, note)}
            onOpen={attach.open}
            onRemove={(a) => attach.remove(a.id)}
            canRemove={(a) => a.mine || attach.canManage}
            onRetryDrive={attach.retry}
          />
        </div>
      )}
      {ctx && <TaskMessages t={t} ctx={ctx} />}
    </div>
  );
}

const late = (t: StageTask) =>
  t.status !== "concluido" && !!t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());

const dayOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA") : "");

/** Datas da tarefa: mostra o prazo; ao clicar, edita início e prazo. */
function TaskDatesButton({
  t,
  canEdit,
  onSave,
}: {
  t: StageTask;
  canEdit: boolean;
  onSave?: (taskId: string, start: string | null, due: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const late = t.status !== "concluido" && !!t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
  const label = t.due_date ? new Date(t.due_date).toLocaleDateString("pt-BR") : "Datas";
  if (!canEdit || !onSave) {
    return t.due_date ? (
      <span className={`shrink-0 text-[11px] ${late ? "font-semibold text-rose-600" : "text-muted-foreground"}`}>{label}</span>
    ) : null;
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setStart(dayOf(t.start_date));
          setDue(dayOf(t.due_date));
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-10 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs hover:bg-muted max-sm:border sm:h-7 sm:rounded-full sm:px-2 sm:text-[11px] ${late ? "font-semibold text-rose-600 max-sm:border-rose-200" : "text-muted-foreground hover:text-foreground"}`}
          title="Editar datas da tarefa"
          aria-label={`Datas da tarefa: ${label}`}
        >
          <CalendarClock className="h-3.5 w-3.5" /> {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <p className="text-sm font-semibold">Datas da tarefa</p>
        <div className="space-y-1">
          <Label className="text-xs">Início</Label>
          <Input type="date" value={start} max={due || undefined} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Prazo</Label>
          <Input type="date" value={due} min={start || undefined} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            size="sm"
            disabled={saving || (!!start && !!due && start > due)}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(t.id, start || null, due || null);
                toast.success("Datas da tarefa atualizadas");
                setOpen(false);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Mensagens da tarefa: campo sempre aberto + últimas mensagens. */
function TaskMessages({ t, ctx, card = false }: { t: StageTask; ctx: TaskCtx; card?: boolean }) {
  const list = ctx.messages.get(t.id) ?? [];
  const [body, setBody] = useState("");
  const [vis, setVis] = useState<"equipe" | "cliente">("equipe");
  const [all, setAll] = useState(false);
  const [sending, setSending] = useState(false);
  const shown = all ? list : list.slice(-2);
  async function send() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      await ctx.sendMessage(t, text, vis);
      setBody("");
      toast.success(vis === "cliente" ? "Mensagem enviada ao cliente (portal)" : "Mensagem registrada para a equipe");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar");
    } finally {
      setSending(false);
    }
  }
  return (
    <div className={card ? "space-y-2" : "space-y-1.5 px-2.5 pb-2.5 sm:px-2 sm:pb-2 sm:pl-8"}>
      {list.length > 2 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-[11px] font-medium text-primary hover:underline">
          {all ? "Mostrar só as últimas" : `Ver todas as mensagens (${list.length})`}
        </button>
      )}
      {shown.map((m) => (
        <div
          key={m.id}
          className={`rounded-md px-2.5 py-1.5 text-xs ${m.author_kind === "cliente" ? "bg-amber-50 dark:bg-amber-500/10" : m.visibility === "cliente" ? "bg-sky-50 dark:bg-sky-500/10" : "bg-muted/60"}`}
        >
          <p className="text-[10px] text-muted-foreground">
            <strong className="text-foreground">{m.owner_id === ctx.meId ? "Você" : m.author}</strong>
            {m.author_kind === "cliente" ? " (cliente)" : m.visibility === "cliente" ? " · para o cliente" : " · interna"} ·{" "}
            {new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="whitespace-pre-wrap break-words">{plain(m.body)}</p>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        {!card && <MessageSquare className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />}
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={4000}
          placeholder={vis === "cliente" ? "Mensagem para o cliente (portal)…" : "Mensagem para a equipe…"}
          aria-label={`Mensagem na tarefa ${t.title}`}
          className={`min-w-0 flex-1 ${card ? "h-11 text-sm" : "h-11 text-[15px] sm:h-8 sm:text-xs"} ${vis === "cliente" ? "border-amber-300 bg-amber-50/60 dark:bg-amber-500/5" : "bg-background"}`}
        />
        <button
          type="button"
          onClick={() => setVis((v) => (v === "equipe" ? "cliente" : "equipe"))}
          className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 font-medium ${card ? "h-11 text-xs" : "h-11 text-xs sm:h-8 sm:px-2 sm:text-[11px]"} ${vis === "cliente" ? "border-amber-300 text-amber-800 dark:text-amber-300" : "text-muted-foreground"}`}
          title="Trocar destino: equipe (interna) ou cliente (portal)"
          aria-label={`Destino: ${vis === "cliente" ? "cliente" : "equipe"}. Clique para trocar.`}
        >
          {vis === "cliente" ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          <span>{vis === "cliente" ? "Cliente" : "Equipe"}</span>
        </button>
        <Button size="icon" className={card ? "h-11 w-11 shrink-0" : "h-11 w-11 shrink-0 sm:h-8 sm:w-8"} disabled={!body.trim() || sending} onClick={send} aria-label="Enviar mensagem">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
