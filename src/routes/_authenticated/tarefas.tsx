import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, Trash2, X, Mail, Video, CalendarPlus, Pencil, Target, User as UserIcon, MoreVertical, AlarmClock, Building2, SlidersHorizontal, Settings2, LayoutGrid, List as ListIcon, Calendar as CalendarIcon, CalendarCheck, ListTodo, Clock } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, closestCorners,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { format, differenceInCalendarDays, parseISO, startOfDay, addDays, isSameDay } from "date-fns";
import {
  TaskDrawer, PRIORITY_LABEL, PRIORITY_TONE,
  type TaskStatus, type Priority,
} from "@/components/tasks/TaskDrawer";
import { useKanbanColumns, DEFAULT_STATUS_COLS, type KanbanColumn } from "@/hooks/useKanbanColumns";
import { EditKanbanDialog } from "@/components/tasks/EditKanbanDialog";
import { SendEmailDialog } from "@/components/tasks/SendEmailDialog";
import { ScheduleMeetingDialog } from "@/components/tasks/ScheduleMeetingDialog";
import { useServerFn } from "@tanstack/react-start";
import { createInstantMeet } from "@/lib/google/calendar.functions";
import { syncEntityToSheets } from "@/lib/google/sheets-sync.functions";
import { TaskQuickForm, type TaskQuickFormDefaults } from "@/components/tasks/TaskQuickForm";
import { TaskCalendarView } from "@/components/tasks/TaskCalendarView";
import { TaskFiltersSheet } from "@/components/tasks/TaskFiltersSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/useWorkspace";
import { scopeOrganization } from "@/lib/org/filter";
import { listLeadScheduledTasks } from "@/lib/pipeline/tasks.functions";
import { leadTaskDisplay, type LeadScheduledTask } from "@/lib/pipeline/task-display";
import { toggleLeadTask } from "@/lib/pipeline/pipeline.functions";
import { LeadTaskDialog } from "@/components/pipeline/LeadTaskDialog";
import { matchesTaskDateRange } from "@/lib/tasks/date-filter";

type ViewMode = "kanban" | "lista" | "calendario";

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({ meta: [
    { title: "Tarefas — Hublynx Core" },
    { name: "description", content: "Tarefas de projetos e agendamentos de leads em Lista, Kanban e Calendário." },
    { property: "og:title", content: "Tarefas — Hublynx Core" },
    { property: "og:description", content: "Prioridades, tarefas e agendamentos da sua empresa." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { task?: string; view?: ViewMode } => ({
    task: typeof s.task === "string" ? s.task : undefined,
    view: (["kanban", "lista", "calendario"].includes(String(s.view)) ? s.view : undefined) as ViewMode | undefined,
  }),
  component: TarefasPage,
});

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  project_id: string | null;
  client_id: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
  briefing?: any;
  leadTask?: LeadScheduledTask;
};

function TarefasPage() {
  const qc = useQueryClient();
  const { activeOrganizationId } = useWorkspace();
  const tasksKey = ["tasks", "central", activeOrganizationId ?? "none"] as const;
  const leadTasksKey = ["tasks", "lead-schedules", activeOrganizationId ?? "none"] as const;
  const listSchedules = useServerFn(listLeadScheduledTasks);
  const toggleSchedule = useServerFn(toggleLeadTask);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const search = useSearch({ from: "/_authenticated/tarefas" });
  const view: ViewMode = (search.view as ViewMode) ?? "lista";
  const setView = (v: ViewMode) =>
    navigate({ to: "/tarefas", search: { task: search.task, view: v }, replace: true });

  const [searchText, setSearchText] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<Date>();
  const [filterDateTo, setFilterDateTo] = useState<Date>();
  const [openFilters, setOpenFilters] = useState(false);
  const [openNew, setOpenNew] = useState(false);
  const [newDefaults, setNewDefaults] = useState<TaskQuickFormDefaults | undefined>(undefined);
  const [openEditKanban, setOpenEditKanban] = useState(false);
  const { data: kanbanCols = DEFAULT_STATUS_COLS } = useKanbanColumns();

  const openNewIn = (defaults?: TaskQuickFormDefaults) => {
    setNewDefaults(defaults);
    setOpenNew(true);
  };

  const selectedId = search.task ?? null;
  const setSelectedId = (id: string | null) =>
    navigate({ to: "/tarefas", search: { task: id ?? undefined, view }, replace: true });

  const { data: generalTasks = [], isLoading: tasksLoading, error: tasksError } = useQuery({
    queryKey: tasksKey,
    queryFn: async () => {
      const { data, error } = await scopeOrganization(supabase.from("tasks").select("*"), activeOrganizationId).order("position");
      if (error) throw error;
      return data as Task[];
    },
    staleTime: 60_000,
    enabled: !!activeOrganizationId,
  });

  const { data: schedules = [], isLoading: schedulesLoading, error: schedulesError } = useQuery({
    queryKey: leadTasksKey,
    queryFn: () => {
      if (!activeOrganizationId) throw new Error("Selecione uma empresa.");
      return listSchedules({ data: { organizationId: activeOrganizationId } });
    },
    enabled: !!activeOrganizationId,
    staleTime: 60_000,
  });
  const tasks = useMemo<Task[]>(() => [...generalTasks, ...schedules.map(leadTaskDisplay)], [generalTasks, schedules]);
  const isLoading = tasksLoading || schedulesLoading;
  const selectedSchedule = tasks.find((task) => task.id === selectedId)?.leadTask;

  const { data: labelsIndex = {} } = useQuery({
    queryKey: ["tasks-labels-index"],
    queryFn: async () => {
      const [assigns, labels] = await Promise.all([
        supabase.from("task_label_assignments").select("task_id,label_id"),
        supabase.from("task_labels").select("id,name,color"),
      ]);
      const byId = new Map((labels.data ?? []).map((l: any) => [l.id, l]));
      const map: Record<string, { id: string; name: string; color: string }[]> = {};
      (assigns.data ?? []).forEach((a: any) => {
        const l = byId.get(a.label_id);
        if (!l) return;
        (map[a.task_id] ||= []).push(l as any);
      });
      return map;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-mini"],
    queryFn: async () => (await supabase.from("projects").select("id,name").order("name")).data ?? [],
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => (await supabase.from("clients").select("id,name,email").order("name")).data ?? [],
  });
  const clientsById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; email: string | null }>();
    (clients as any[]).forEach((c) => m.set(c.id, c));
    return m;
  }, [clients]);
  const projectsById = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    (projects as any[]).forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (searchText && !t.title.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterProject !== "all" && t.project_id !== filterProject) return false;
      if (filterClient !== "all" && t.client_id !== filterClient) return false;
      if (!matchesTaskDateRange(t.due_date, filterDateFrom, filterDateTo)) return false;
      return true;
    });
  }, [tasks, searchText, filterPriority, filterProject, filterClient, filterDateFrom, filterDateTo]);

  const activeFiltersCount =
    (filterPriority !== "all" ? 1 : 0) +
    (filterProject !== "all" ? 1 : 0) +
    (filterClient !== "all" ? 1 : 0) +
    (filterDateFrom || filterDateTo ? 1 : 0);
  const clearFilters = () => {
    setFilterPriority("all"); setFilterProject("all"); setFilterClient("all");
    setFilterDateFrom(undefined); setFilterDateTo(undefined);
  };

  const syncSheet = useServerFn(syncEntityToSheets);
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const schedule = tasks.find((task) => task.id === id)?.leadTask;
      if (schedule) {
        if (status !== "a_fazer" && status !== "concluido") throw new Error("Agendamentos de leads podem ficar a fazer ou concluídos.");
        await toggleSchedule({ data: { id: schedule.id, done: status === "concluido" } });
        return id;
      }
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
      return id;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(tasksKey);
      qc.setQueryData<Task[]>(tasksKey, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, status } : t)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(tasksKey, ctx.prev);
      toast.error("Não foi possível mover a tarefa.");
    },
    onSuccess: (id) => {
      const schedule = tasks.find((task) => task.id === id)?.leadTask;
      if (schedule) {
        qc.invalidateQueries({ queryKey: ["lead-detail", schedule.lead_id] });
        qc.invalidateQueries({ queryKey: ["agenda"] });
        return;
      }
      syncSheet({ data: { entityType: "task", recordId: id } }).catch(() => {});
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const kanbanScrollRef = useRef<HTMLDivElement>(null);
  const onKanbanPanStart = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = kanbanScrollRef.current;
    if (!el) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-task-card], button, a, input, textarea, select, [role='button']")) return;
    e.preventDefault();
    const startX = e.pageX;
    const startScroll = el.scrollLeft;
    const onMove = (ev: MouseEvent) => { el.scrollLeft = startScroll - (ev.pageX - startX); };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    const targetStatus = kanbanCols.find((c) => c.key === overId)?.key;
    if (!targetStatus) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task || task.status === targetStatus) return;
    if (task.leadTask && targetStatus !== "a_fazer" && targetStatus !== "concluido") {
      toast.info("Agendamentos de leads podem ficar a fazer ou concluídos.");
      return;
    }
    updateStatus.mutate({ id: String(active.id), status: targetStatus });
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 md:flex md:items-center md:justify-between md:flex-wrap">
        <div className="min-w-0">
          <h1 className="truncate text-2xl md:text-3xl font-semibold tracking-tight">Tarefas</h1>
          <p className="hidden md:block text-muted-foreground mt-1 text-sm">
            Lista de prioridades. Alterne para Kanban ou Calendário quando precisar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isMobile && (
            <>
              <Button variant="outline" onClick={() => setOpenEditKanban(true)}>
                <Settings2 className="h-4 w-4 mr-2" /> Editar Kanban
              </Button>
              <Button className="bg-[#00D084] hover:bg-[#00b873] text-white" onClick={() => openNewIn()}>
                <Plus className="h-4 w-4 mr-2" /> Nova tarefa
              </Button>
            </>
          )}
          {isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setOpenEditKanban(true)}>
                  <Settings2 className="h-4 w-4 mr-2" /> Editar Kanban
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/app/hoje">📱 Abrir Central PWA</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Barra de ações: busca, filtros, visualização, total */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] md:max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar tarefa..."
            className="pl-9"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        <Button variant="outline" onClick={() => setOpenFilters(true)} className="relative">
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Filtros
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#00D084] text-white text-[10px] font-bold flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </Button>

        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)} className="ml-auto">
          <TabsList className="h-9">
            <TabsTrigger value="lista" className="gap-1.5 px-3">
              <ListIcon className="h-4 w-4" /> <span className="hidden sm:inline">Lista</span>
            </TabsTrigger>
            <TabsTrigger value="kanban" className="gap-1.5 px-3">
              <LayoutGrid className="h-4 w-4" /> <span className="hidden sm:inline">Kanban</span>
            </TabsTrigger>
            <TabsTrigger value="calendario" className="gap-1.5 px-3">
              <CalendarIcon className="h-4 w-4" /> <span className="hidden sm:inline">Calendário</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="text-xs md:text-sm font-medium text-muted-foreground tabular-nums hidden sm:block">
          {filtered.length} {filtered.length === 1 ? "tarefa" : "tarefas"}
        </div>
      </div>

      {(searchText || activeFiltersCount > 0) && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtros ativos:</span>
          <Button variant="ghost" size="sm" onClick={() => { setSearchText(""); clearFilters(); }}>
            <X className="h-4 w-4 mr-1" /> Limpar
          </Button>
        </div>
      )}

      {(tasksError || schedulesError) && <p role="alert" className="text-sm text-destructive">Não foi possível carregar todas as tarefas. <Button variant="link" onClick={() => qc.invalidateQueries({ queryKey: ["tasks"] })}>Tentar novamente</Button></p>}
      <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
        <TabsContent value="lista" className="mt-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <TaskListGrouped
              tasks={filtered}
              kanbanCols={kanbanCols}
              labelsIndex={labelsIndex}
              clientsById={clientsById}
              projectsById={projectsById}
              onSelect={setSelectedId}
            />
          )}
        </TabsContent>

        <TabsContent value="kanban" className="mt-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
              <div
                ref={kanbanScrollRef}
                onMouseDown={onKanbanPanStart}
                className="flex flex-1 gap-4 overflow-x-auto pb-4 cursor-grab active:cursor-grabbing [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {kanbanCols.map((col) => {
                  const colTasks = filtered.filter((t) => t.status === col.key);
                  return (
                    <KanbanColumn
                      key={col.key}
                      col={col}
                      tasks={colTasks}
                      kanbanCols={kanbanCols}
                      labelsIndex={labelsIndex}
                      clientsById={clientsById}
                      projectsById={projectsById}
                      onSelect={setSelectedId}
                      onAddInColumn={(k) => openNewIn({ status: k })}
                    />
                  );
                })}
              </div>
              <DragOverlay>
                {activeTask ? (
                  <div className="w-72 rotate-2">
                  <TaskCard
                    task={activeTask}
                    labels={labelsIndex[activeTask.id] ?? []}
                    client={activeTask.client_id ? clientsById.get(activeTask.client_id) ?? null : null}
                    project={activeTask.project_id ? projectsById.get(activeTask.project_id) ?? null : null}
                    kanbanCols={kanbanCols}
                    dragging
                  />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </TabsContent>

        <TabsContent value="calendario" className="mt-2">
          <TaskCalendarView
            tasks={filtered as any}
            onSelectTask={setSelectedId}
            onCreateAt={(dateISO) => openNewIn({ date: dateISO })}
          />
        </TabsContent>
      </Tabs>

      {/* FAB mobile */}
      {isMobile && (
        <button
          onClick={() => openNewIn()}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-[#00D084] hover:bg-[#00b873] text-white shadow-lg flex items-center justify-center z-40 active:scale-95 transition"
          aria-label="Nova tarefa"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {selectedSchedule ? <LeadTaskDialog key={selectedSchedule.id} task={selectedSchedule} onClose={() => setSelectedId(null)} /> : <TaskDrawer taskId={selectedId?.startsWith("lead:") ? null : selectedId} open={!!selectedId && !selectedId.startsWith("lead:")} onClose={() => setSelectedId(null)} />}
      <EditKanbanDialog open={openEditKanban} onOpenChange={setOpenEditKanban} />
      <TaskQuickForm
        open={openNew}
        onOpenChange={(o) => { setOpenNew(o); if (!o) setNewDefaults(undefined); }}
        defaults={newDefaults}
      />
      <TaskFiltersSheet
        open={openFilters}
        onOpenChange={setOpenFilters}
        filterPriority={filterPriority} setFilterPriority={setFilterPriority}
        filterProject={filterProject} setFilterProject={setFilterProject}
        filterClient={filterClient} setFilterClient={setFilterClient}
        filterDateFrom={filterDateFrom} setFilterDateFrom={setFilterDateFrom}
        filterDateTo={filterDateTo} setFilterDateTo={setFilterDateTo}
        projects={projects as any[]} clients={clients as any[]}
        onClear={clearFilters}
      />
    </div>
  );
}

function TaskListGrouped({
  tasks, kanbanCols, labelsIndex, clientsById, projectsById, onSelect,
}: {
  tasks: Task[];
  kanbanCols: KanbanColumn[];
  labelsIndex: Record<string, LabelItem[]>;
  clientsById: Map<string, ClientMini>;
  projectsById: Map<string, { id: string; name: string }>;
  onSelect: (id: string) => void;
}) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, 7);

  const groups = useMemo(() => {
    const g: Record<string, Task[]> = { vencidas: [], hoje: [], semana: [], depois: [], semData: [], concluidas: [] };
    tasks.forEach((t) => {
      // concluídas e canceladas saem da fila e vão para um grupo próprio no fim
      if (t.status === "concluido" || t.status === "cancelado") {
        g.concluidas.push(t);
        return;
      }
      if (!t.due_date) {
        g.semData.push(t);
        return;
      }
      const d = parseISO(t.due_date);
      if (d < today) g.vencidas.push(t);
      else if (d >= today && d < tomorrow) g.hoje.push(t);
      else if (d >= tomorrow && d < nextWeek) g.semana.push(t);
      else g.depois.push(t);
    });
    const sorter = (a: Task, b: Task) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    };
    g.vencidas.sort(sorter);
    g.hoje.sort(sorter);
    g.semana.sort(sorter);
    g.depois.sort(sorter);
    g.semData.sort((a, b) => a.title.localeCompare(b.title));
    return g;
  }, [tasks, today, tomorrow, nextWeek]);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <ListTodo className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">Nada por aqui. Aproveite para focar no que importa.</p>
        <p className="text-sm text-muted-foreground mt-1">Crie uma nova tarefa quando quiser.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TaskGroup
        title="Vencidas"
        tone="rose"
        tasks={groups.vencidas}
        kanbanCols={kanbanCols}
        labelsIndex={labelsIndex}
        clientsById={clientsById}
        projectsById={projectsById}
        onSelect={onSelect}
        dueFormatter={(d) => `Venceu há ${differenceInCalendarDays(today, d)} dia${differenceInCalendarDays(today, d) === 1 ? "" : "s"}`}
      />
      <TaskGroup
        title="Hoje"
        tone="amber"
        tasks={groups.hoje}
        kanbanCols={kanbanCols}
        labelsIndex={labelsIndex}
        clientsById={clientsById}
        projectsById={projectsById}
        onSelect={onSelect}
        dueFormatter={() => "Hoje"}
      />
      <TaskGroup
        title="Esta semana"
        tone="brand-blue"
        tasks={groups.semana}
        kanbanCols={kanbanCols}
        labelsIndex={labelsIndex}
        clientsById={clientsById}
        projectsById={projectsById}
        onSelect={onSelect}
        dueFormatter={(d) => format(d, "EEEE, dd/MM", { locale: undefined })}
      />
      <TaskGroup
        title="Depois"
        tone="slate"
        tasks={groups.depois}
        kanbanCols={kanbanCols}
        labelsIndex={labelsIndex}
        clientsById={clientsById}
        projectsById={projectsById}
        onSelect={onSelect}
        dueFormatter={(d) => format(d, "dd/MM/yyyy")}
      />
      {groups.concluidas.length > 0 && (
        <details>
          <summary className="mb-3 cursor-pointer text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Concluídas ({groups.concluidas.length})
          </summary>
          <TaskGroup
            title="Concluídas"
            tone="muted"
            tasks={groups.concluidas}
            kanbanCols={kanbanCols}
            labelsIndex={labelsIndex}
            clientsById={clientsById}
            projectsById={projectsById}
            onSelect={onSelect}
            dueFormatter={(d) => format(d, "dd/MM/yyyy")}
          />
        </details>
      )}
      {groups.semData.length > 0 && (
        <TaskGroup
          title="Sem data"
          tone="muted"
          tasks={groups.semData}
          kanbanCols={kanbanCols}
          labelsIndex={labelsIndex}
          clientsById={clientsById}
          projectsById={projectsById}
          onSelect={onSelect}
          dueFormatter={() => "—"}
        />
      )}
    </div>
  );
}

const TONE_BAR: Record<string, string> = {
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  "brand-blue": "bg-[#00A8E8]",
  slate: "bg-slate-400",
  muted: "bg-muted-foreground/40",
};

function TaskGroup({
  title, tone, tasks, kanbanCols, labelsIndex, clientsById, projectsById, onSelect, dueFormatter,
}: {
  title: string;
  tone: string;
  tasks: Task[];
  kanbanCols: KanbanColumn[];
  labelsIndex: Record<string, LabelItem[]>;
  clientsById: Map<string, ClientMini>;
  projectsById: Map<string, { id: string; name: string }>;
  onSelect: (id: string) => void;
  dueFormatter: (d: Date) => string;
}) {
  if (tasks.length === 0) return null;
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("h-2 w-2 rounded-full", TONE_BAR[tone] ?? TONE_BAR.muted)} />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">({tasks.length})</span>
      </div>
      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskListItem
            key={t.id}
            task={t}
            labels={labelsIndex[t.id] ?? []}
            client={t.client_id ? clientsById.get(t.client_id) ?? null : null}
            project={t.project_id ? projectsById.get(t.project_id) ?? null : null}
            kanbanCols={kanbanCols}
            onClick={() => onSelect(t.id)}
            dueFormatter={dueFormatter}
          />
        ))}
      </div>
    </section>
  );
}

function TaskListItem({
  task, labels = [], client, project, kanbanCols, onClick, dueFormatter,
}: {
  task: Task;
  labels?: LabelItem[];
  client?: ClientMini | null;
  project?: { id: string; name: string } | null;
  kanbanCols?: KanbanColumn[];
  onClick?: () => void;
  dueFormatter: (d: Date) => string;
}) {
  const col = kanbanCols?.find((c) => c.key === task.status);
  const meeting = (task.briefing as any)?.type === "reuniao";
  const deadline = (task.briefing as any)?.deadline as string | null | undefined;
  const dueDate = task.due_date ? parseISO(task.due_date) : null;

  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer border-border hover:border-brand-blue/40 hover:shadow-sm transition-all"
    >
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="mt-1 shrink-0">
          {meeting ? (
            <CalendarCheck className="h-4 w-4 text-indigo-500" />
          ) : (
            <ListTodo className="h-4 w-4 text-emerald-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{task.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {task.leadTask && <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3 shrink-0" />Lead · {task.leadTask.leads.name}</span>}
                {client && (
                  <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
                    <UserIcon className="h-3 w-3 shrink-0" />
                    {client.name}
                  </span>
                )}
                {project && (
                  <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
                    <Target className="h-3 w-3 shrink-0" />
                    {project.name}
                  </span>
                )}
                {deadline && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3 shrink-0" />
                    Prazo {format(parseISO(deadline), "dd/MM/yyyy")}
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {dueDate && (
                <p className={cn(
                  "text-xs font-medium tabular-nums",
                  dueDate < startOfDay(new Date()) ? "text-rose-500" : "text-muted-foreground"
                )}>
                  {dueFormatter(dueDate)}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {dueDate ? format(dueDate, "HH:mm") : "—"}
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {col && (
              <Badge variant="secondary" className={cn("text-[10px]", col.tone)}>
                {col.label}
              </Badge>
            )}
            <Badge variant="outline" className={cn("text-[10px]", PRIORITY_TONE[task.priority])}>
              {PRIORITY_LABEL[task.priority]}
            </Badge>
            {labels.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded text-white"
                style={{ backgroundColor: l.color || "#2563EB" }}
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

type LabelItem = { id: string; name: string; color: string };
type ClientMini = { id: string; name: string; email: string | null };

const PRIORITY_ACCENT: Record<Priority, string> = {
  baixa: "from-slate-300 to-slate-400",
  media: "from-brand-blue to-sky-400",
  alta: "from-amber-400 to-orange-500",
  critica: "from-rose-500 to-red-600",
};

const PRIORITY_DOT: Record<Priority, string> = {
  baixa: "bg-slate-400",
  media: "bg-sky-500",
  alta: "bg-amber-500",
  critica: "bg-rose-500",
};

const TONE_TO_ACCENT: Record<string, string> = {
  "bg-muted text-muted-foreground": "bg-muted-foreground/40",
  "bg-blue-100 text-blue-700": "bg-blue-500",
  "bg-amber-100 text-amber-700": "bg-amber-500",
  "bg-indigo-100 text-indigo-700": "bg-indigo-500",
  "bg-emerald-100 text-emerald-700": "bg-emerald-500",
  "bg-rose-100 text-rose-700": "bg-rose-500",
  "bg-violet-100 text-violet-700": "bg-violet-500",
  "bg-orange-100 text-orange-700": "bg-orange-500",
  "bg-teal-100 text-teal-700": "bg-teal-500",
  "bg-slate-200 text-slate-700": "bg-slate-500",
};
const accentForTone = (tone: string) => TONE_TO_ACCENT[tone] ?? "bg-muted-foreground/40";

function KanbanColumn({
  col, tasks, kanbanCols, labelsIndex, clientsById, projectsById, onSelect, onAddInColumn,
}: {
  col: KanbanColumn;
  tasks: Task[];
  kanbanCols: KanbanColumn[];
  labelsIndex: Record<string, LabelItem[]>;
  clientsById: Map<string, ClientMini>;
  projectsById: Map<string, { id: string; name: string }>;
  onSelect: (id: string) => void;
  onAddInColumn: (statusKey: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  // Mesmo layout das colunas do Pipeline de Vendas.
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30 transition ${isOver ? "border-primary/60 bg-primary/5" : ""}`}
    >
      <div className={`h-1.5 rounded-t-xl ${accentForTone(col.tone)}`} />
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{col.label}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onAddInColumn(col.key)}
          title="Adicionar tarefa nesta coluna"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        {tasks.map((t) => (
          <DraggableCard
            key={t.id}
            task={t}
            labels={labelsIndex[t.id] ?? []}
            client={t.client_id ? clientsById.get(t.client_id) ?? null : null}
            project={t.project_id ? projectsById.get(t.project_id) ?? null : null}
            kanbanCols={kanbanCols}
            onSelect={onSelect}
          />
        ))}
        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Arraste tarefas para cá</p>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  task, labels, client, project, kanbanCols, onSelect,
}: { task: Task; labels: LabelItem[]; client: ClientMini | null; project: { id: string; name: string } | null; kanbanCols: KanbanColumn[]; onSelect: (id: string) => void }) {
  // Como no Pipeline: o card inteiro é arrastável e quem se move é o DragOverlay.
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : undefined}>
      <TaskCard task={task} labels={labels} client={client} project={project} kanbanCols={kanbanCols} onClick={() => onSelect(task.id)} dragHandle={{ ...attributes, ...listeners }} />
    </div>
  );
}

function TaskCard({
  task, labels = [], client, project, kanbanCols, onClick, dragging, dragHandle,
}: {
  task: Task;
  labels?: LabelItem[];
  client?: ClientMini | null;
  project?: { id: string; name: string } | null;
  kanbanCols?: KanbanColumn[];
  onClick?: () => void;
  dragging?: boolean;
  dragHandle?: any;
}) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [meetOpen, setMeetOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const instantMeet = useServerFn(createInstantMeet);
  const qc = useQueryClient();
  const meeting = (task.briefing as any)?.type === "reuniao";
  const done = kanbanCols?.find((c) => c.key === task.status)?.key === "concluido" || task.status === "concluido";
  // Datas à meia-noite UTC são "dia inteiro": mostra a data gravada, sem converter fuso.
  const due = task.due_date ? new Date(task.due_date) : null;
  const allDay = !!due && due.getUTCHours() === 0 && due.getUTCMinutes() === 0;
  const dueLabel = due
    ? allDay
      ? due.toLocaleDateString("pt-BR", { timeZone: "UTC" })
      : `${due.toLocaleDateString("pt-BR")} · ${due.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : null;
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const dueKey = due ? (allDay ? due.toISOString().slice(0, 10) : format(due, "yyyy-MM-dd")) : null;
  const overdue = !!dueKey && dueKey < todayKey && !done;

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa excluída.");
      setConfirmDel(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir tarefa."),
  });

  const quickMeet = useMutation({
    mutationFn: async () =>
      instantMeet({ data: { taskId: task.id, summary: task.title, durationMinutes: 30 } }),
    onSuccess: (res: any) => {
      if (res.meetLink) {
        navigator.clipboard?.writeText(res.meetLink).catch(() => {});
        window.open(res.meetLink, "_blank");
        toast.success("Reunião criada — link copiado.");
      } else {
        toast.success("Reunião criada.");
      }
      qc.invalidateQueries({ queryKey: ["task-communications", task.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar Meet"),
  });

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <div
        data-task-card
        {...(dragHandle ?? {})}
        onClick={onClick}
        className={`group cursor-pointer rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md ${dragging ? "shadow-lg ring-2 ring-primary/30" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className={`line-clamp-2 flex items-center gap-1.5 text-sm font-semibold leading-tight ${done ? "text-muted-foreground line-through" : ""}`}>
            {meeting && <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
            {task.title}
          </p>
          {!task.leadTask && <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={stop} onPointerDown={stop}>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100" title="Ações">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={stop} onPointerDown={stop}>
              <DropdownMenuItem onSelect={() => onClick?.()}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEmailOpen(true)}>
                <Mail className="mr-2 h-3.5 w-3.5" /> Enviar e-mail
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setMeetOpen(true)}>
                <CalendarPlus className="mr-2 h-3.5 w-3.5" /> Agendar reunião
              </DropdownMenuItem>
              <DropdownMenuItem disabled={quickMeet.isPending} onSelect={() => quickMeet.mutate()}>
                <Video className="mr-2 h-3.5 w-3.5" /> Criar link Meet
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onSelect={() => setConfirmDel(true)}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>

        {task.leadTask && <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><UserIcon className="h-3 w-3 shrink-0" />Lead · {task.leadTask.leads.name}</p>}
        {client && (
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" /> <span className="truncate">{client.name}</span>
          </p>
        )}
        {project && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Target className="h-3 w-3 shrink-0" /> <span className="truncate">{project.name}</span>
          </p>
        )}
        {client?.email && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{client.email}</span>
          </p>
        )}

        {dueLabel && (
          <p
            className={`mt-1.5 flex items-center gap-1 truncate rounded-md px-1.5 py-1 text-[11px] ${
              overdue ? "bg-destructive/10 font-medium text-destructive" : "bg-muted text-muted-foreground"
            }`}
          >
            <AlarmClock className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {dueLabel}
              {overdue ? " (atrasada)" : ""}
            </span>
          </p>
        )}

        {labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {labels.map((l) => {
              const c = l.color || "#2563EB";
              return (
                <span
                  key={l.id}
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: `${c}1f`, color: c }}
                >
                  {l.name}
                </span>
              );
            })}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] font-semibold">
            <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
            {PRIORITY_LABEL[task.priority]}
          </Badge>
          {meeting && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
              Reunião
            </Badge>
          )}
        </div>
      </div>

      {emailOpen && (
        <SendEmailDialog
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          taskId={task.id}
          taskTitle={task.title}
          defaultTo={client?.email ?? null}
          clientName={client?.name ?? null}
        />
      )}
      {meetOpen && (
        <ScheduleMeetingDialog
          open={meetOpen}
          onClose={() => setMeetOpen(false)}
          taskId={task.id}
          taskTitle={task.title}
          defaultAttendee={client?.email ?? null}
        />
      )}
      <AlertDialog open={confirmDel} onOpenChange={(o) => !o && setConfirmDel(false)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa "{task.title}" será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={del.isPending}
              onClick={(e) => { e.preventDefault(); del.mutate(); }}
            >
              {del.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DeleteTaskBtn({ id }: { id: string }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Tarefa excluída."); },
  });
  return (
    <Button
      variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
      onClick={(e) => { e.stopPropagation(); del.mutate(); }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
