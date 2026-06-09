import { createFileRoute } from "@tanstack/react-router";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search, Trash2, GripVertical, MessageSquare, ListChecks, X } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, closestCorners,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({ meta: [{ title: "Tarefas — Hublynx Core" }] }),
  component: TarefasPage,
});

type TaskStatus =
  | "backlog" | "planejado" | "em_andamento" | "aguardando_cliente"
  | "revisao" | "concluido" | "cancelado";
type Priority = "baixa" | "media" | "alta" | "critica";

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

const STATUS_COLS: { key: TaskStatus; label: string; tone: string }[] = [
  { key: "backlog", label: "Backlog", tone: "bg-muted text-muted-foreground" },
  { key: "planejado", label: "Planejado", tone: "bg-blue-100 text-blue-700" },
  { key: "em_andamento", label: "Em andamento", tone: "bg-amber-100 text-amber-700" },
  { key: "aguardando_cliente", label: "Aguardando cliente", tone: "bg-purple-100 text-purple-700" },
  { key: "revisao", label: "Revisão", tone: "bg-indigo-100 text-indigo-700" },
  { key: "concluido", label: "Concluído", tone: "bg-emerald-100 text-emerald-700" },
  { key: "cancelado", label: "Cancelado", tone: "bg-rose-100 text-rose-700" },
];

const PRIORITY_TONE: Record<Priority, string> = {
  baixa: "bg-emerald-50 text-emerald-700 border-emerald-200",
  media: "bg-amber-50 text-amber-700 border-amber-200",
  alta: "bg-orange-50 text-orange-700 border-orange-200",
  critica: "bg-rose-50 text-rose-700 border-rose-200",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica",
};

function TarefasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [openNew, setOpenNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks").select("*").order("position");
      if (error) throw error;
      return data as Task[];
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
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterProject !== "all" && t.project_id !== filterProject) return false;
      if (filterClient !== "all" && t.client_id !== filterClient) return false;
      return true;
    });
  }, [tasks, search, filterPriority, filterProject, filterClient]);

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

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
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
          <NewTaskDialog
            projects={projects}
            clients={clients}
            onClose={() => setOpenNew(false)}
          />
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar tarefa..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
        {(search || filterPriority !== "all" || filterProject !== "all" || filterClient !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => {
            setSearch(""); setFilterPriority("all"); setFilterProject("all"); setFilterClient("all");
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
                    <KanbanColumn
                      key={col.key}
                      col={col}
                      tasks={colTasks}
                      onSelect={setSelectedId}
                    />
                  );
                })}
              </div>
              <DragOverlay>
                {activeTask ? <TaskCard task={activeTask} dragging /> : null}
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
                  const col = STATUS_COLS.find((c) => c.key === t.status)!;
                  return (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => setSelectedId(t.id)}>
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell><Badge variant="secondary" className={col.tone}>{col.label}</Badge></TableCell>
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

      <TaskDetailSheet
        taskId={selectedId}
        onClose={() => setSelectedId(null)}
        projects={projects}
        clients={clients}
      />
    </div>
  );
}

function KanbanColumn({
  col, tasks, onSelect,
}: { col: typeof STATUS_COLS[number]; tasks: Task[]; onSelect: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div ref={setNodeRef} className={`w-72 shrink-0 rounded-xl bg-muted/40 p-3 transition-colors ${isOver ? "ring-2 ring-primary/40" : ""}`}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${col.tone}`}>{col.label}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
      </div>
      <div className="space-y-2 min-h-[80px]">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ task, onSelect }: { task: Task; onSelect: (id: string) => void }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 } : { opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard task={task} onClick={() => onSelect(task.id)} dragHandle={{ ...attributes, ...listeners }} />
    </div>
  );
}

function TaskCard({
  task, onClick, dragging, dragHandle,
}: { task: Task; onClick?: () => void; dragging?: boolean; dragHandle?: any }) {
  return (
    <div
      onClick={onClick}
      className={`group bg-background rounded-lg border border-border/60 p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${dragging ? "shadow-lg" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button {...dragHandle} className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab pt-0.5" onClick={(e) => e.stopPropagation()}>
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge variant="outline" className={`${PRIORITY_TONE[task.priority]} text-[10px] py-0`}>
              {PRIORITY_LABEL[task.priority]}
            </Badge>
            {task.due_date && (
              <span className="text-[11px] text-muted-foreground">
                {format(new Date(task.due_date), "dd/MM")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewTaskDialog({
  projects, clients, onClose,
}: { projects: any[]; clients: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [status, setStatus] = useState<TaskStatus>("planejado");
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

function TaskDetailSheet({
  taskId, onClose, projects, clients,
}: { taskId: string | null; onClose: () => void; projects: any[]; clients: any[] }) {
  const qc = useQueryClient();

  const { data: task } = useQuery({
    queryKey: ["task", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId!).maybeSingle();
      if (error) throw error;
      return data as Task;
    },
  });
  const { data: checklist = [] } = useQuery({
    queryKey: ["task-checklist", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data } = await supabase.from("task_checklists").select("*").eq("task_id", taskId!).order("position");
      return data ?? [];
    },
  });
  const { data: comments = [] } = useQuery({
    queryKey: ["task-comments", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data } = await supabase.from("task_comments").select("*").eq("task_id", taskId!).order("created_at");
      return data ?? [];
    },
  });

  const [newCheck, setNewCheck] = useState("");
  const [newComment, setNewComment] = useState("");

  const update = useMutation({
    mutationFn: async (patch: Partial<Task>) => {
      const { error } = await supabase.from("tasks").update(patch).eq("id", taskId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const addCheck = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("task_checklists").insert({
        task_id: taskId!, owner_id: u.user!.id, label: newCheck, done: false, position: checklist.length,
      });
      if (error) throw error;
    },
    onSuccess: () => { setNewCheck(""); qc.invalidateQueries({ queryKey: ["task-checklist", taskId] }); },
  });
  const toggleCheck = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("task_checklists").update({ done }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checklist", taskId] }),
  });
  const delCheck = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_checklists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checklist", taskId] }),
  });

  const addComment = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("task_comments").insert({
        task_id: taskId!, owner_id: u.user!.id, body: newComment,
      });
      if (error) throw error;
    },
    onSuccess: () => { setNewComment(""); qc.invalidateQueries({ queryKey: ["task-comments", taskId] }); },
  });

  return (
    <Sheet open={!!taskId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {task && (
          <>
            <SheetHeader>
              <SheetTitle>
                <Input
                  value={task.title}
                  className="text-lg font-semibold border-0 px-0 focus-visible:ring-0 shadow-none"
                  onChange={(e) => update.mutate({ title: e.target.value })}
                />
              </SheetTitle>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={task.status} onValueChange={(v) => update.mutate({ status: v as TaskStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_COLS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select value={task.priority} onValueChange={(v) => update.mutate({ priority: v as Priority })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                        <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Projeto</Label>
                  <Select value={task.project_id ?? "none"} onValueChange={(v) => update.mutate({ project_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={task.client_id ?? "none"} onValueChange={(v) => update.mutate({ client_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Prazo</Label>
                  <Input
                    type="date"
                    value={task.due_date ? task.due_date.slice(0, 10) : ""}
                    onChange={(e) => update.mutate({ due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  rows={4}
                  defaultValue={task.description ?? ""}
                  onBlur={(e) => update.mutate({ description: e.target.value || null })}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ListChecks className="h-4 w-4" /> Checklist
                </div>
                <div className="space-y-1">
                  {checklist.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-2 group">
                      <Checkbox checked={c.done} onCheckedChange={(v) => toggleCheck.mutate({ id: c.id, done: !!v })} />
                      <span className={`text-sm flex-1 ${c.done ? "line-through text-muted-foreground" : ""}`}>{c.label}</span>
                      <button onClick={() => delCheck.mutate(c.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); if (newCheck) addCheck.mutate(); }} className="flex gap-2">
                  <Input value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Adicionar item..." className="h-9" />
                  <Button type="submit" size="sm" variant="outline" disabled={!newCheck}>Adicionar</Button>
                </form>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="h-4 w-4" /> Comentários
                </div>
                <div className="space-y-2">
                  {comments.map((c: any) => (
                    <div key={c.id} className="rounded-lg bg-muted/40 p-3">
                      <p className="text-sm">{c.body}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{format(new Date(c.created_at), "dd/MM/yyyy HH:mm")}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); if (newComment) addComment.mutate(); }} className="space-y-2">
                  <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={2} placeholder="Escreva um comentário..." />
                  <Button type="submit" size="sm" disabled={!newComment} className="bg-[#00D084] hover:bg-[#00b873] text-white">Comentar</Button>
                </form>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
