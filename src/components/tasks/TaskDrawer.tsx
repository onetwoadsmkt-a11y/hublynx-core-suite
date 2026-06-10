import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import {
  X, MoreHorizontal, Copy, Trash2, Plus, Paperclip, Download, Eye,
  GripVertical, ExternalLink, Tag, ChevronRight,
  Mail, CalendarPlus, Video,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { RichTextEditor } from "./RichTextEditor";
import DOMPurify from "dompurify";
import { TaskCommunicationsTab } from "./TaskCommunicationsTab";
import { SendEmailDialog } from "./SendEmailDialog";
import { ScheduleMeetingDialog } from "./ScheduleMeetingDialog";
import { createInstantMeet } from "@/lib/google/calendar.functions";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type TaskStatus = "backlog" | "a_fazer" | "em_andamento" | "revisao" | "concluido";
export type Priority = "baixa" | "media" | "alta" | "critica";

export const STATUS_COLS: { key: TaskStatus; label: string; tone: string }[] = [
  { key: "backlog", label: "Backlog", tone: "bg-muted text-muted-foreground" },
  { key: "a_fazer", label: "A fazer", tone: "bg-blue-100 text-blue-700" },
  { key: "em_andamento", label: "Em andamento", tone: "bg-amber-100 text-amber-700" },
  { key: "revisao", label: "Revisão", tone: "bg-indigo-100 text-indigo-700" },
  { key: "concluido", label: "Concluído", tone: "bg-emerald-100 text-emerald-700" },
];

export const PRIORITY_TONE: Record<Priority, string> = {
  baixa: "bg-emerald-50 text-emerald-700 border-emerald-200",
  media: "bg-amber-50 text-amber-700 border-amber-200",
  alta: "bg-orange-50 text-orange-700 border-orange-200",
  critica: "bg-rose-50 text-rose-700 border-rose-200",
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta", critica: "Urgente",
};

const BRIEFING_FIELDS = [
  { key: "objective", label: "Objetivo" },
  { key: "audience", label: "Público-alvo" },
  { key: "references", label: "Referências" },
  { key: "competitors", label: "Concorrentes" },
  { key: "restrictions", label: "Restrições" },
  { key: "deliverables", label: "Entregáveis esperados" },
] as const;

const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png", "image/jpeg",
  "application/zip", "application/x-zip-compressed",
];

export function TaskDrawer({
  taskId, open, onClose,
}: { taskId: string | null; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[720px] p-0 flex flex-col">
        {taskId && <DrawerBody taskId={taskId} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: task, isLoading } = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, project:projects(id,name,status,progress), client:clients(id,name,company,phone,whatsapp,email)")
        .eq("id", taskId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa excluída.");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });

  const duplicate = useMutation({
    mutationFn: async () => {
      if (!task) return;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("tasks").insert({
        owner_id: u.user!.id,
        title: task.title + " (cópia)",
        description: task.description,
        priority: task.priority,
        status: "backlog",
        project_id: task.project_id,
        client_id: task.client_id,
        assignee_id: task.assignee_id,
        position: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tarefa duplicada."); qc.invalidateQueries({ queryKey: ["tasks"] }); },
  });

  if (isLoading || !task) {
    return <div className="p-10 text-sm text-muted-foreground">Carregando…</div>;
  }

  const status = STATUS_COLS.find((s) => s.key === task.status)!;

  return (
    <div className="flex flex-col h-full">
      {/* Header sticky */}
      <div className="border-b px-6 py-4 sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className={status.tone}>{status.label}</Badge>
          <Badge variant="outline" className={PRIORITY_TONE[task.priority as Priority]}>
            {PRIORITY_LABEL[task.priority as Priority]}
          </Badge>
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => duplicate.mutate()}>
                  <Copy className="h-4 w-4 mr-2" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => del.mutate()} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <Input
          value={task.title}
          onChange={(e) => update.mutate({ title: e.target.value })}
          className="text-xl font-semibold border-0 px-0 focus-visible:ring-0 shadow-none h-auto"
        />
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
        <div className="border-b px-6 sticky top-[88px] bg-background z-10">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
            {[
              ["overview", "Geral"], ["briefing", "Briefing"], ["notes", "Notas"],
              ["checklist", "Checklist"], ["attachments", "Anexos"], ["comments", "Comentários"],
              ["communications", "Comunicações"],
              ["history", "Histórico"], ["related", "Relacionados"],
            ].map(([k, l]) => (
              <TabsTrigger key={k} value={k}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2 text-sm">
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6">
            <TabsContent value="overview" className="mt-0"><OverviewTab task={task} update={update} /></TabsContent>
            <TabsContent value="briefing" className="mt-0"><BriefingTab task={task} update={update} /></TabsContent>
            <TabsContent value="notes" className="mt-0"><NotesTab task={task} update={update} /></TabsContent>
            <TabsContent value="checklist" className="mt-0"><ChecklistTab taskId={taskId} /></TabsContent>
            <TabsContent value="attachments" className="mt-0"><AttachmentsTab taskId={taskId} /></TabsContent>
            <TabsContent value="comments" className="mt-0"><CommentsTab taskId={taskId} /></TabsContent>
            <TabsContent value="communications" className="mt-0"><TaskCommunicationsTab taskId={taskId} /></TabsContent>
            <TabsContent value="history" className="mt-0"><HistoryTab taskId={taskId} /></TabsContent>
            <TabsContent value="related" className="mt-0"><RelatedTab task={task} /></TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

/* ============================== OVERVIEW ============================== */
function OverviewTab({ task, update }: { task: any; update: any }) {
  const { data: projects = [] } = useQuery({
    queryKey: ["projects-mini"],
    queryFn: async () => (await supabase.from("projects").select("id,name").order("name")).data ?? [],
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => (await supabase.from("clients").select("id,name,company,phone,whatsapp,email").order("name")).data ?? [],
  });

  const client = task.client;
  const project = task.project;

  const [emailOpen, setEmailOpen] = useState(false);
  const [meetOpen, setMeetOpen] = useState(false);
  const instantMeet = useServerFn(createInstantMeet);
  const qc = useQueryClient();
  const quickMeet = useMutation({
    mutationFn: async () =>
      instantMeet({ data: { taskId: task.id, summary: task.title, durationMinutes: 30 } }),
    onSuccess: (res: any) => {
      if (res?.meetLink) {
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

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="space-y-2">
        <Label>Descrição</Label>
        <RichTextEditor
          value={task.description ?? ""}
          onChange={(html) => update.mutate({ description: html })}
          placeholder="Descreva a tarefa..."
          minHeight={120}
        />
      </div>
          value={task.description ?? ""}
          onChange={(html) => update.mutate({ description: html })}
          placeholder="Descreva a tarefa..."
          minHeight={120}
        />
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Status">
          <Select value={task.status} onValueChange={(v) => update.mutate({ status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_COLS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Prioridade">
          <Select value={task.priority} onValueChange={(v) => update.mutate({ priority: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Projeto">
          <Select value={task.project_id ?? "none"} onValueChange={(v) => update.mutate({ project_id: v === "none" ? null : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cliente">
          <Select value={task.client_id ?? "none"} onValueChange={(v) => update.mutate({ client_id: v === "none" ? null : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Início">
          <Input type="date" value={dateInput(task.start_date)} onChange={(e) => update.mutate({ start_date: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </Field>
        <Field label="Prazo">
          <Input type="date" value={dateInput(task.due_date)} onChange={(e) => update.mutate({ due_date: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </Field>
        <Field label="Horas estimadas">
          <Input type="number" step="0.25" value={task.estimated_hours ?? ""} onChange={(e) => update.mutate({ estimated_hours: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        <Field label="Horas reais">
          <Input type="number" step="0.25" value={task.actual_hours ?? ""} onChange={(e) => update.mutate({ actual_hours: e.target.value ? Number(e.target.value) : null })} />
        </Field>
      </div>

      {/* Time progress */}
      {task.estimated_hours ? (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Tempo gasto</span>
            <span className="tabular-nums">{Number(task.actual_hours ?? 0)}h / {Number(task.estimated_hours)}h</span>
          </div>
          <Progress value={Math.min(100, ((Number(task.actual_hours ?? 0) / Number(task.estimated_hours)) * 100))} className="h-1.5" />
        </div>
      ) : null}

      <Separator />

      {/* Labels */}
      <LabelsBlock taskId={task.id} />

      {/* Client card */}
      {client && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cliente</p>
              <p className="text-base font-semibold mt-1">{client.name}</p>
              {client.company && <p className="text-sm text-muted-foreground">{client.company}</p>}
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href={`/clientes`}><ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir</a>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {client.email && <div><span className="text-muted-foreground">E-mail:</span> {client.email}</div>}
            {client.phone && <div><span className="text-muted-foreground">Tel:</span> {client.phone}</div>}
            {client.whatsapp && <div><span className="text-muted-foreground">WhatsApp:</span> {client.whatsapp}</div>}
          </div>
        </div>
      )}

      {/* Project card */}
      {project && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Projeto</p>
              <p className="text-base font-semibold mt-1">{project.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{String(project.status).replace("_", " ")}</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href={`/projetos`}><ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir</a>
            </Button>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Progresso</span><span className="tabular-nums">{project.progress}%</span></div>
            <Progress value={project.progress} className="h-1.5" />
          </div>
        </div>
      )}

      {/* Custom fields */}
      <CustomFieldsBlock taskId={task.id} />

      {/* Meta */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>Criado em {format(new Date(task.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
        {task.completed_at && <p>Concluído em {format(new Date(task.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>}
      </div>
    </div>
  );
}

/* ============================== BRIEFING ============================== */
function BriefingTab({ task, update }: { task: any; update: any }) {
  const briefing = (task.briefing ?? {}) as Record<string, string>;
  const [draft, setDraft] = useState<Record<string, string>>(briefing);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setDraft(briefing), [task.id]); // eslint-disable-line

  function setField(key: string, value: string) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => update.mutate({ briefing: next }), 800);
  }

  return (
    <div className="space-y-5">
      {BRIEFING_FIELDS.map((f) => (
        <div key={f.key} className="space-y-2">
          <Label>{f.label}</Label>
          <RichTextEditor
            value={draft[f.key] ?? ""}
            onChange={(html) => setField(f.key, html)}
            placeholder={`Descreva ${f.label.toLowerCase()}...`}
            minHeight={80}
          />
        </div>
      ))}
    </div>
  );
}

/* ============================== NOTES ============================== */
function NotesTab({ task, update }: { task: any; update: any }) {
  const [draft, setDraft] = useState<string>(task.internal_notes ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setDraft(task.internal_notes ?? ""), [task.id]); // eslint-disable-line

  function onChange(html: string) {
    setDraft(html);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => update.mutate({ internal_notes: html }), 800);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Anotações privadas da equipe. Salva automaticamente.</p>
      <RichTextEditor value={draft} onChange={onChange} placeholder="Escreva suas notas internas..." minHeight={300} />
    </div>
  );
}

/* ============================== CHECKLIST ============================== */
function ChecklistTab({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["task-checklist", taskId],
    queryFn: async () => (await supabase.from("task_checklists").select("*").eq("task_id", taskId).order("position")).data ?? [],
  });
  const [label, setLabel] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("task_checklists").insert({
        task_id: taskId, owner_id: u.user!.id, label, done: false, position: items.length,
      });
      if (error) throw error;
    },
    onSuccess: () => { setLabel(""); qc.invalidateQueries({ queryKey: ["task-checklist", taskId] }); },
  });
  const toggle = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("task_checklists").update({ done }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checklist", taskId] }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_checklists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checklist", taskId] }),
  });
  const editLabel = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase.from("task_checklists").update({ label }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checklist", taskId] }),
  });
  const reorder = useMutation({
    mutationFn: async (ordered: any[]) => {
      await Promise.all(ordered.map((it, idx) =>
        supabase.from("task_checklists").update({ position: idx }).eq("id", it.id),
      ));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checklist", taskId] }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const total = items.length;
  const done = items.filter((i: any) => i.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i: any) => i.id === active.id);
    const newIdx = items.findIndex((i: any) => i.id === over.id);
    const next = arrayMove(items, oldIdx, newIdx);
    qc.setQueryData(["task-checklist", taskId], next);
    reorder.mutate(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{done} de {total} concluídos</p>
        <span className="text-sm text-muted-foreground tabular-nums">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i: any) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {items.map((it: any) => (
              <SortableItem key={it.id} item={it} onToggle={(done) => toggle.mutate({ id: it.id, done })} onDelete={() => del.mutate(it.id)} onEdit={(label) => editLabel.mutate({ id: it.id, label })} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <form onSubmit={(e) => { e.preventDefault(); if (label) add.mutate(); }} className="flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Adicionar item..." />
        <Button type="submit" disabled={!label}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
      </form>
    </div>
  );
}

function SortableItem({
  item, onToggle, onDelete, onEdit,
}: { item: any; onToggle: (done: boolean) => void; onDelete: () => void; onEdit: (label: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(item.label);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-1.5 group rounded hover:bg-muted/40 px-1">
      <button {...attributes} {...listeners} className="text-muted-foreground/40 cursor-grab"><GripVertical className="h-4 w-4" /></button>
      <Checkbox checked={item.done} onCheckedChange={(c) => onToggle(!!c)} />
      {editing ? (
        <Input
          autoFocus value={v} onChange={(e) => setV(e.target.value)}
          onBlur={() => { setEditing(false); if (v !== item.label) onEdit(v); }}
          onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); if (v !== item.label) onEdit(v); } }}
          className="h-7"
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          className={`text-sm flex-1 ${item.done ? "line-through text-muted-foreground" : ""}`}
        >
          {item.label}
        </span>
      )}
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ============================== ATTACHMENTS ============================== */
function AttachmentsTab({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { data: files = [] } = useQuery({
    queryKey: ["task-attachments", taskId],
    queryFn: async () => (await supabase.from("task_attachments").select("*").eq("task_id", taskId).order("uploaded_at", { ascending: false })).data ?? [],
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 20 * 1024 * 1024) throw new Error("Arquivo maior que 20MB.");
      if (file.type && !ALLOWED_MIME.includes(file.type)) throw new Error("Tipo de arquivo não permitido.");
      const { data: u } = await supabase.auth.getUser();
      const path = `${u.user!.id}/${taskId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("task_attachments").insert({
        task_id: taskId, owner_id: u.user!.id, uploaded_by: u.user!.id,
        name: file.name, size: file.size, mime: file.type, storage_path: path,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Arquivo enviado."); qc.invalidateQueries({ queryKey: ["task-attachments", taskId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (f: any) => {
      await supabase.storage.from("task-attachments").remove([f.storage_path]);
      const { error } = await supabase.from("task_attachments").delete().eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Arquivo removido."); qc.invalidateQueries({ queryKey: ["task-attachments", taskId] }); },
  });

  async function preview(f: any) {
    const { data } = await supabase.storage.from("task-attachments").createSignedUrl(f.storage_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }
  async function download(f: any) {
    const { data } = await supabase.storage.from("task-attachments").createSignedUrl(f.storage_path, 300, { download: f.name });
    if (data?.signedUrl) window.location.href = data.signedUrl;
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => accepted.forEach((f) => upload.mutate(f)),
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"],
      "application/zip": [".zip"],
    },
    maxSize: 20 * 1024 * 1024,
  });

  return (
    <div className="space-y-4">
      <div {...getRootProps()} className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${isDragActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
        <input {...getInputProps()} />
        <Paperclip className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">{isDragActive ? "Solte os arquivos aqui" : "Arraste arquivos ou clique para enviar"}</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX, PNG, JPG, ZIP — até 20MB</p>
      </div>

      <div className="space-y-2">
        {files.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhum arquivo enviado.</p>}
        {files.map((f: any) => (
          <div key={f.id} className="flex items-center gap-3 rounded-lg border p-3 bg-card">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Paperclip className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{f.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(f.size)} · {format(new Date(f.uploaded_at), "dd/MM/yyyy HH:mm")}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => preview(f)}><Eye className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => download(f)}><Download className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => del.mutate(f)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== COMMENTS ============================== */
function CommentsTab({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { data: comments = [] } = useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: async () => (await supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at")).data ?? [],
  });
  const { data: me } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: p } = await supabase.from("profiles").select("id,full_name").eq("id", u.user!.id).maybeSingle();
      return p;
    },
  });

  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const mentions = extractMentions(body);
      const { error } = await supabase.from("task_comments").insert({
        task_id: taskId, owner_id: u.user!.id, body, parent_id: replyTo, mentions,
      });
      if (error) throw error;
    },
    onSuccess: () => { setBody(""); setReplyTo(null); qc.invalidateQueries({ queryKey: ["task-comments", taskId] }); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-comments", taskId] }),
  });

  const roots = comments.filter((c: any) => !c.parent_id);
  const repliesByParent = comments.reduce((acc: Record<string, any[]>, c: any) => {
    if (c.parent_id) (acc[c.parent_id] ??= []).push(c);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {roots.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhum comentário ainda.</p>}
        {roots.map((c: any) => (
          <div key={c.id}>
            <CommentRow comment={c} meId={me?.id} onReply={() => setReplyTo(c.id)} onDelete={() => del.mutate(c.id)} />
            {(repliesByParent[c.id] ?? []).map((r: any) => (
              <div key={r.id} className="ml-10 mt-2">
                <CommentRow comment={r} meId={me?.id} onDelete={() => del.mutate(r.id)} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-3 space-y-2">
        {replyTo && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ChevronRight className="h-3 w-3" /> Respondendo
            <button onClick={() => setReplyTo(null)} className="text-destructive hover:underline">cancelar</button>
          </div>
        )}
        <RichTextEditor value={body} onChange={setBody} placeholder="Escreva um comentário... Use @ para mencionar." minHeight={70} />
        <div className="flex justify-end">
          <Button size="sm" disabled={!body || body === "<p></p>"} onClick={() => add.mutate()} className="bg-[#00D084] hover:bg-[#00b873] text-white">
            {replyTo ? "Responder" : "Comentar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CommentRow({ comment, meId, onReply, onDelete }: { comment: any; meId?: string; onReply?: () => void; onDelete?: () => void }) {
  const { data: author } = useQuery({
    queryKey: ["profile", comment.owner_id],
    queryFn: async () => (await supabase.from("profiles").select("full_name").eq("id", comment.owner_id).maybeSingle()).data,
  });
  const name = author?.full_name ?? "Usuário";
  const initials = name.split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8"><AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback></Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{format(new Date(comment.created_at), "dd/MM 'às' HH:mm")}</span>
        </div>
        <div className="prose prose-sm max-w-none mt-1" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.body) }} />
        <div className="flex items-center gap-3 mt-1 text-xs">
          {onReply && <button onClick={onReply} className="text-muted-foreground hover:text-foreground">Responder</button>}
          {meId === comment.owner_id && onDelete && (
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive">Excluir</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================== HISTORY ============================== */
const ACTION_LABELS: Record<string, string> = {
  task_created: "criou a tarefa",
  task_edited: "editou",
  status_changed: "mudou o status",
  priority_changed: "mudou a prioridade",
  assignee_changed: "alterou o responsável",
  project_changed: "alterou o projeto",
  client_changed: "alterou o cliente",
  due_date_changed: "alterou o prazo",
  checklist_added: "adicionou ao checklist",
  checklist_done: "concluiu item",
  checklist_undone: "desmarcou item",
  checklist_deleted: "removeu item do checklist",
  file_uploaded: "enviou um arquivo",
  file_deleted: "removeu um arquivo",
  comment_added: "comentou",
};

function HistoryTab({ taskId }: { taskId: string }) {
  const { data: events = [] } = useQuery({
    queryKey: ["task-history", taskId],
    queryFn: async () => (await supabase.from("task_history").select("*").eq("task_id", taskId).order("created_at", { ascending: false }).limit(100)).data ?? [],
  });

  return (
    <div className="space-y-1">
      {events.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Sem registros.</p>}
      {events.map((e: any) => <HistoryRow key={e.id} event={e} />)}
    </div>
  );
}

function HistoryRow({ event }: { event: any }) {
  const { data: actor } = useQuery({
    queryKey: ["profile", event.actor_id],
    enabled: !!event.actor_id,
    queryFn: async () => (await supabase.from("profiles").select("full_name").eq("id", event.actor_id).maybeSingle()).data,
  });
  const name = actor?.full_name ?? "Sistema";
  const label = ACTION_LABELS[event.action] ?? event.action;
  let detail = "";
  if (event.field === "status" && event.old_value && event.new_value) {
    detail = ` de "${STATUS_COLS.find(s => s.key === event.old_value)?.label ?? event.old_value}" para "${STATUS_COLS.find(s => s.key === event.new_value)?.label ?? event.new_value}"`;
  } else if (event.field === "priority" && event.old_value && event.new_value) {
    detail = ` de "${PRIORITY_LABEL[event.old_value as Priority] ?? event.old_value}" para "${PRIORITY_LABEL[event.new_value as Priority] ?? event.new_value}"`;
  } else if (event.new_value) {
    detail = `: "${event.new_value.slice(0, 80)}"`;
  }

  return (
    <div className="flex gap-3 py-2 border-b last:border-0">
      <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm"><span className="font-medium">{name}</span> {label}{detail}</p>
        <p className="text-xs text-muted-foreground">{format(new Date(event.created_at), "dd/MM/yyyy HH:mm:ss")}</p>
      </div>
    </div>
  );
}

/* ============================== RELATED ============================== */
function RelatedTab({ task }: { task: any }) {
  const qc = useQueryClient();
  const { data: related = [] } = useQuery({
    queryKey: ["task-related", task.id],
    queryFn: async () => (await supabase.from("task_related").select("*").eq("task_id", task.id)).data ?? [],
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => (await supabase.from("clients").select("id,name").order("name")).data ?? [],
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects-mini"],
    queryFn: async () => (await supabase.from("projects").select("id,name").order("name")).data ?? [],
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks-mini"],
    queryFn: async () => (await supabase.from("tasks").select("id,title").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  const { data: events = [] } = useQuery({
    queryKey: ["events-mini"],
    queryFn: async () => (await supabase.from("events").select("id,title").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  const add = useMutation({
    mutationFn: async ({ type, id }: { type: "task" | "project" | "client" | "event" | "file"; id: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("task_related").insert({
        task_id: task.id, owner_id: u.user!.id, resource_type: type, resource_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-related", task.id] }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_related").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-related", task.id] }),
  });

  function label(type: string, id: string) {
    if (type === "client") return clients.find((c: any) => c.id === id)?.name;
    if (type === "project") return projects.find((p: any) => p.id === id)?.name;
    if (type === "task") return tasks.find((t: any) => t.id === id)?.title;
    if (type === "event") return events.find((e: any) => e.id === id)?.title;
    return id;
  }

  const typeLabel: Record<string, string> = {
    task: "Tarefa", project: "Projeto", client: "Cliente", event: "Evento", file: "Arquivo",
  };

  return (
    <div className="space-y-5">
      <div>
        <Label className="text-sm font-medium">Recursos relacionados</Label>
        <div className="space-y-2 mt-2">
          {related.length === 0 && <p className="text-sm text-muted-foreground">Nenhum recurso relacionado.</p>}
          {related.map((r: any) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border p-2 bg-card">
              <Badge variant="secondary" className="text-xs">{typeLabel[r.resource_type]}</Badge>
              <span className="text-sm flex-1 truncate">{label(r.resource_type, r.resource_id) ?? "—"}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => del.mutate(r.id)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <AddRelatedRow onAdd={(type, id) => add.mutate({ type, id })} clients={clients} projects={projects} tasks={tasks.filter((t: any) => t.id !== task.id)} events={events} />
      </div>

      <Separator />
      <CustomFieldsBlock taskId={task.id} />
    </div>
  );
}

function AddRelatedRow({ onAdd, clients, projects, tasks, events }: { onAdd: (type: "task" | "project" | "client" | "event" | "file", id: string) => void; clients: any[]; projects: any[]; tasks: any[]; events: any[] }) {
  const [type, setType] = useState<"task" | "project" | "client" | "event" | "file">("project");
  const [id, setId] = useState("");
  const list = type === "client" ? clients : type === "project" ? projects : type === "task" ? tasks : events;
  const labelKey = type === "task" || type === "event" ? "title" : "name";
  return (
    <div className="flex gap-2 mt-3">
      <Select value={type} onValueChange={(v) => { setType(v as typeof type); setId(""); }}>
        <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="project">Projeto</SelectItem>
          <SelectItem value="client">Cliente</SelectItem>
          <SelectItem value="task">Tarefa</SelectItem>
          <SelectItem value="event">Evento</SelectItem>
        </SelectContent>
      </Select>
      <Select value={id} onValueChange={setId}>
        <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
        <SelectContent>
          {list.map((it: any) => <SelectItem key={it.id} value={it.id}>{it[labelKey]}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button onClick={() => { if (id) { onAdd(type, id); setId(""); } }} disabled={!id}><Plus className="h-4 w-4" /></Button>
    </div>
  );
}

/* ============================== LABELS ============================== */
const LABEL_COLORS = ["#2563EB", "#00D084", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#0EA5E9", "#64748B"];

function LabelsBlock({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { data: all = [] } = useQuery({
    queryKey: ["labels"],
    queryFn: async () => (await supabase.from("task_labels").select("*").order("name")).data ?? [],
  });
  const { data: assigned = [] } = useQuery({
    queryKey: ["task-labels", taskId],
    queryFn: async () => (await supabase.from("task_label_assignments").select("label_id").eq("task_id", taskId)).data ?? [],
  });
  const assignedIds = new Set(assigned.map((a: any) => a.label_id));

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);

  const toggle = useMutation({
    mutationFn: async ({ label_id, on }: { label_id: string; on: boolean }) => {
      const { data: u } = await supabase.auth.getUser();
      if (on) {
        const { error } = await supabase.from("task_label_assignments").insert({ task_id: taskId, label_id, owner_id: u.user!.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("task_label_assignments").delete().eq("task_id", taskId).eq("label_id", label_id);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task-labels", taskId] }); qc.invalidateQueries({ queryKey: ["tasks"] }); },
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("task_labels").insert({ owner_id: u.user!.id, name: newName, color: newColor });
      if (error) throw error;
    },
    onSuccess: () => { setNewName(""); qc.invalidateQueries({ queryKey: ["labels"] }); },
  });

  const current = all.filter((l: any) => assignedIds.has(l.id));

  return (
    <div className="space-y-2">
      <Label>Etiquetas</Label>
      <div className="flex flex-wrap gap-1.5 items-center">
        {current.map((l: any) => (
          <Badge key={l.id} style={{ backgroundColor: l.color + "22", color: l.color, borderColor: l.color + "55" }} variant="outline" className="border">
            <Tag className="h-3 w-3 mr-1" /> {l.name}
          </Badge>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 text-xs"><Plus className="h-3 w-3 mr-1" /> Etiqueta</Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3">
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {all.map((l: any) => (
                <label key={l.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 p-1 rounded">
                  <Checkbox checked={assignedIds.has(l.id)} onCheckedChange={(c) => toggle.mutate({ label_id: l.id, on: !!c })} />
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-sm">{l.name}</span>
                </label>
              ))}
            </div>
            <Separator className="my-3" />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Nova etiqueta</p>
              <Input placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8" />
              <div className="flex gap-1 flex-wrap">
                {LABEL_COLORS.map((c) => (
                  <button key={c} onClick={() => setNewColor(c)} className={`h-5 w-5 rounded-full ring-offset-1 ${newColor === c ? "ring-2 ring-foreground" : ""}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <Button size="sm" className="w-full" disabled={!newName} onClick={() => create.mutate()}>Criar</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

/* ============================== CUSTOM FIELDS ============================== */
function CustomFieldsBlock({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { data: fields = [] } = useQuery({
    queryKey: ["custom-fields"],
    queryFn: async () => (await supabase.from("task_custom_fields").select("*").order("position")).data ?? [],
  });
  const { data: values = [] } = useQuery({
    queryKey: ["custom-values", taskId],
    queryFn: async () => (await supabase.from("task_custom_values").select("*").eq("task_id", taskId)).data ?? [],
  });

  const upsert = useMutation({
    mutationFn: async ({ field_id, value }: { field_id: string; value: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const existing = values.find((v: any) => v.field_id === field_id);
      if (existing) {
        const { error } = await supabase.from("task_custom_values").update({ value, updated_at: new Date().toISOString() }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("task_custom_values").insert({ task_id: taskId, field_id, owner_id: u.user!.id, value });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-values", taskId] }),
  });

  if (fields.length === 0) {
    return (
      <div>
        <Label>Campos personalizados</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Nenhum campo definido. <a href="/configuracoes" className="text-primary underline">Criar campos</a>
        </p>
      </div>
    );
  }

  function val(field_id: string) {
    return values.find((v: any) => v.field_id === field_id)?.value ?? "";
  }

  return (
    <div className="space-y-3">
      <Label>Campos personalizados</Label>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f: any) => {
          const v = val(f.id);
          const onSave = (newV: string) => upsert.mutate({ field_id: f.id, value: newV });
          return (
            <div key={f.id} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{f.label}</Label>
              {f.type === "select" ? (
                <Select value={v} onValueChange={onSave}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {((f.options ?? []) as string[]).map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
                  defaultValue={v}
                  onBlur={(e) => { if (e.target.value !== v) onSave(e.target.value); }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== UTILS ============================== */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
function dateInput(iso: string | null | undefined) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function extractMentions(html: string): string[] {
  // Basic: parse @[uuid] markers; UI currently inserts plain text. Returns empty.
  const m = html.match(/@\[([0-9a-f-]{36})\]/gi) ?? [];
  return m.map((s) => s.slice(2, -1));
}
