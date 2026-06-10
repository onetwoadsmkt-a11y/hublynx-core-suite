import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search, Trash2, GripVertical, X, Mail, Video, CalendarPlus, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, closestCorners,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { format, differenceInCalendarDays } from "date-fns";
import {
  TaskDrawer, STATUS_COLS, PRIORITY_LABEL, PRIORITY_TONE,
  type TaskStatus, type Priority,
} from "@/components/tasks/TaskDrawer";
import { SendEmailDialog } from "@/components/tasks/SendEmailDialog";
import { ScheduleMeetingDialog } from "@/components/tasks/ScheduleMeetingDialog";
import { useServerFn } from "@tanstack/react-start";
import { createInstantMeet } from "@/lib/google/calendar.functions";

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({ meta: [{ title: "Tarefas — Hublynx Core" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ task: typeof s.task === "string" ? s.task : undefined }),
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
};

function TarefasPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/tarefas" });
  const [searchText, setSearchText] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [openNew, setOpenNew] = useState(false);

  const selectedId = search.task ?? null;
  const setSelectedId = (id: string | null) =>
    navigate({ to: "/tarefas", search: id ? { task: id } : {}, replace: true });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks").select("*").order("position");
      if (error) throw error;
      return data as Task[];
    },
  });

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
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id,name").order("name");
      return data ?? [];
    },
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id,name").order("name");
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (searchText && !t.title.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterProject !== "all" && t.project_id !== filterProject) return false;
      if (filterClient !== "all" && t.client_id !== filterClient) return false;
      return true;
    });
  }, [tasks, searchText, filterPriority, filterProject, filterClient]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(["tasks"]);
      qc.setQueryData<Task[]>(["tasks"], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, status } : t)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks"], ctx.prev);
      toast.error("Não foi possível mover a tarefa.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    const targetStatus = STATUS_COLS.find((c) => c.key === overId)?.key;
    if (!targetStatus) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task || task.status === targetStatus) return;
    updateStatus.mutate({ id: String(active.id), status: targetStatus });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground mt-1">Organize sua operação em Kanban ou Lista.</p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button className="bg-[#00D084] hover:bg-[#00b873] text-white">
              <Plus className="h-4 w-4 mr-2" /> Nova tarefa
            </Button>
          </DialogTrigger>
          <NewTaskDialog projects={projects} clients={clients} onClose={() => setOpenNew(false)} />
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar tarefa..." className="pl-9" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas prioridades</SelectItem>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Projeto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos projetos</SelectItem>
            {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos clientes</SelectItem>
            {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {(searchText || filterPriority !== "all" || filterProject !== "all" || filterClient !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearchText(""); setFilterPriority("all"); setFilterProject("all"); setFilterClient("all");
          }}>
            <X className="h-4 w-4 mr-1" /> Limpar
          </Button>
        )}
      </div>

      <Tabs defaultValue="kanban">
        <TabsList>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="lista">Lista</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {STATUS_COLS.map((col) => {
                  const colTasks = filtered.filter((t) => t.status === col.key);
                  return (
                    <KanbanColumn key={col.key} col={col} tasks={colTasks} labelsIndex={labelsIndex} onSelect={setSelectedId} />
                  );
                })}
              </div>
              <DragOverlay>
                {activeTask ? <TaskCard task={activeTask} labels={labelsIndex[activeTask.id] ?? []} dragging /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </TabsContent>

        <TabsContent value="lista" className="mt-4">
          <Card className="shadow-[var(--shadow-soft)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarefa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">Nenhuma tarefa.</TableCell></TableRow>
                )}
                {filtered.map((t) => {
                  const col = STATUS_COLS.find((c) => c.key === t.status);
                  return (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => setSelectedId(t.id)}>
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell>{col && <Badge variant="secondary" className={col.tone}>{col.label}</Badge>}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={PRIORITY_TONE[t.priority]}>
                          {PRIORITY_LABEL[t.priority]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.due_date ? format(new Date(t.due_date), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeleteTaskBtn id={t.id} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <TaskDrawer taskId={selectedId} open={!!selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

type LabelItem = { id: string; name: string; color: string };

const PRIORITY_ACCENT: Record<Priority, string> = {
  baixa: "from-slate-300 to-slate-400",
  media: "from-brand-blue to-sky-400",
  alta: "from-amber-400 to-orange-500",
  critica: "from-rose-500 to-red-600",
};

function KanbanColumn({
  col, tasks, labelsIndex, onSelect,
}: { col: typeof STATUS_COLS[number]; tasks: Task[]; labelsIndex: Record<string, LabelItem[]>; onSelect: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div ref={setNodeRef} className={`w-72 shrink-0 rounded-xl bg-muted/40 p-3 transition-colors ${isOver ? "ring-2 ring-primary/40" : ""}`}>
      <div className="flex items-center justify-between mb-3 px-1">
        <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${col.tone}`}>{col.label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
      </div>
      <div className="space-y-2.5 min-h-[80px]">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} labels={labelsIndex[t.id] ?? []} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ task, labels, onSelect }: { task: Task; labels: LabelItem[]; onSelect: (id: string) => void }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 }
    : { opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard task={task} labels={labels} onClick={() => onSelect(task.id)} dragHandle={{ ...attributes, ...listeners }} />
    </div>
  );
}

function TaskCard({
  task, labels = [], onClick, dragging, dragHandle,
}: { task: Task; labels?: LabelItem[]; onClick?: () => void; dragging?: boolean; dragHandle?: any }) {
  const accent = PRIORITY_ACCENT[task.priority];
  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden bg-card rounded-xl border border-border/60 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-card)] hover:border-brand-blue/40 hover:-translate-y-0.5 transition-all cursor-pointer ${dragging ? "shadow-lg ring-2 ring-brand-blue/30" : ""}`}
    >
      {/* Cover: priority accent stripe + labels */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${accent}`} />
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {labels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full text-white shadow-sm"
              style={{ backgroundColor: l.color || "#2563EB" }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 p-3">
        <button {...dragHandle} className="text-muted-foreground/30 group-hover:text-muted-foreground cursor-grab pt-0.5" onClick={(e) => e.stopPropagation()}>
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug text-foreground">{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2" dangerouslySetInnerHTML={{ __html: stripHtml(task.description).slice(0, 140) }} />}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge variant="outline" className={`${PRIORITY_TONE[task.priority]} text-[10px] py-0 border-0`}>
              {PRIORITY_LABEL[task.priority]}
            </Badge>
            {task.due_date && (
              <span className="text-[11px] text-muted-foreground font-medium tabular-nums">
                {format(new Date(task.due_date), "dd/MM")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function NewTaskDialog({
  projects, clients, onClose,
}: { projects: any[]; clients: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [status, setStatus] = useState<TaskStatus>("a_fazer");
  const [projectId, setProjectId] = useState<string>("none");
  const [clientId, setClientId] = useState<string>("none");
  const [dueDate, setDueDate] = useState<string>("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { error } = await supabase.from("tasks").insert({
        owner_id: u.user.id,
        title,
        description: description || null,
        priority,
        status,
        project_id: projectId === "none" ? null : projectId,
        client_id: clientId === "none" ? null : clientId,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        position: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa criada.");
      setTitle(""); setDescription(""); setDueDate("");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Revisar campanha de junho" />
        </div>
        <div className="space-y-2">
          <Label>Descrição</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                  <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_COLS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Projeto</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Prazo</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button
          className="bg-[#00D084] hover:bg-[#00b873] text-white"
          disabled={!title || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Criando..." : "Criar tarefa"}
        </Button>
      </DialogFooter>
    </DialogContent>
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
