import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ListTodo, CalendarCheck, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { syncEntityToSheets } from "@/lib/google/sheets-sync.functions";
import { syncTaskToCalendar } from "@/lib/google/calendar.functions";
import { PRIORITY_LABEL, type Priority } from "@/components/tasks/TaskDrawer";
import { cn } from "@/lib/utils";

export type TaskQuickFormDefaults = {
  kind?: "tarefa" | "reuniao";
  date?: string; // yyyy-mm-dd
  time?: string; // HH:mm
  projectId?: string | null;
  clientId?: string | null;
  status?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaults?: TaskQuickFormDefaults;
  onCreated?: (id: string) => void;
}

type ChecklistDraft = { id: string; label: string };

export function TaskQuickForm({ open, onOpenChange, defaults, onCreated }: Props) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { activeOrganizationId } = useWorkspace();
  const syncSheet = useServerFn(syncEntityToSheets);
  const syncCalendar = useServerFn(syncTaskToCalendar);

  const [kind, setKind] = useState<"tarefa" | "reuniao">(defaults?.kind ?? "tarefa");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaults?.date ?? "");
  const [time, setTime] = useState(defaults?.time ?? "");
  const [dueDate, setDueDate] = useState("");
  const [checklist, setChecklist] = useState<ChecklistDraft[]>([]);
  const [checklistInput, setChecklistInput] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [priority, setPriority] = useState<Priority>("media");
  const [projectId, setProjectId] = useState<string>(defaults?.projectId ?? "none");
  const [clientId, setClientId] = useState<string>(defaults?.clientId ?? "none");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setKind(defaults?.kind ?? "tarefa");
      setTitle("");
      setDate(defaults?.date ?? "");
      setTime(defaults?.time ?? "");
      setDueDate("");
      setChecklist([]);
      setChecklistInput("");
      setShowMore(false);
      setPriority("media");
      setProjectId(defaults?.projectId ?? "none");
      setClientId(defaults?.clientId ?? "none");
      setDescription("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-mini"],
    queryFn: async () => (await supabase.from("projects").select("id,name").order("name")).data ?? [],
    enabled: open,
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => (await supabase.from("clients").select("id,name").order("name")).data ?? [],
    enabled: open,
  });

  const canSubmit = useMemo(() => {
    if (!title.trim()) return false;
    if (kind === "reuniao") {
      if (!date || !time) return false;
    }
    return true;
  }, [title, kind, date, time]);

  const addChecklist = () => {
    const v = checklistInput.trim();
    if (!v) return;
    setChecklist((prev) => [...prev, { id: Math.random().toString(36).slice(2), label: v }]);
    setChecklistInput("");
  };

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");

      let dueIso: string | null = null;
      if (date) {
        const iso = time ? `${date}T${time}:00` : `${date}T09:00:00`;
        dueIso = new Date(iso).toISOString();
      } else if (kind === "tarefa" && dueDate) {
        dueIso = new Date(`${dueDate}T09:00:00`).toISOString();
      }

      const { data: inserted, error } = await supabase.from("tasks").insert({
        owner_id: u.user.id,
        ...(activeOrganizationId ? { organization_id: activeOrganizationId } : {}),
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status: defaults?.status ?? "a_fazer",
        project_id: projectId === "none" ? null : projectId,
        client_id: clientId === "none" ? null : clientId,
        due_date: dueIso,
        position: 0,
        briefing: { type: kind === "reuniao" ? "reuniao" : "tarefa", deadline: dueDate || null } as any,
      } as never).select("id").single();
      if (error) throw error;
      const taskId = inserted.id as string;

      if (checklist.length > 0) {
        const rows = checklist.map((it, idx) => ({
          task_id: taskId,
          owner_id: u.user!.id,
          label: it.label,
          done: false,
          position: idx,
        }));
        await supabase.from("task_checklists").insert(rows);
      }

      return { taskId, hasDate: !!dueIso };
    },
    onSuccess: ({ taskId, hasDate }) => {
      toast.success(kind === "reuniao" ? "Reunião criada." : "Tarefa criada.");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["agenda"] });
      qc.invalidateQueries({ queryKey: ["project-dashboard"] });
      qc.invalidateQueries({ queryKey: ["project-stage-tasks"] });
      qc.invalidateQueries({ queryKey: ["hub-today"] });
      qc.invalidateQueries({ queryKey: ["agenda"] });
      onCreated?.(taskId);
      onOpenChange(false);
      syncSheet({ data: { entityType: "task", recordId: taskId } }).catch(() => {});
      if (hasDate) {
        syncCalendar({ data: { taskId, withMeet: kind === "reuniao" } })
          .then(() => toast.success("Sincronizado com Google Agenda."))
          .catch((e: any) => toast.error(`Google Agenda: ${e.message}`));
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const Body = (
    <div className="space-y-4">
      {/* Toggle tipo */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
        <button
          type="button"
          onClick={() => setKind("tarefa")}
          className={cn(
            "flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition",
            kind === "tarefa" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <ListTodo className="h-4 w-4" /> Tarefa
        </button>
        <button
          type="button"
          onClick={() => setKind("reuniao")}
          className={cn(
            "flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition",
            kind === "reuniao" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          <CalendarCheck className="h-4 w-4" /> Reunião
        </button>
      </div>

      <div className="space-y-2">
        <Label>Título</Label>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "reuniao" ? "Ex: Reunião de kickoff" : "Ex: Revisar campanha"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Data{kind === "reuniao" && " *"}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Hora{kind === "reuniao" ? " *" : ""}</Label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      {kind === "tarefa" && (
        <div className="space-y-2">
          <Label>Prazo (opcional)</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      )}

      {/* Checklist */}
      <div className="space-y-2">
        <Label>Checklist</Label>
        <div className="flex gap-2">
          <Input
            value={checklistInput}
            onChange={(e) => setChecklistInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklist(); } }}
            placeholder="Adicionar item…"
          />
          <Button type="button" variant="outline" size="icon" onClick={addChecklist}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {checklist.length > 0 && (
          <ul className="space-y-1.5 pt-1">
            {checklist.map((it) => (
              <li key={it.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={false} disabled className="opacity-60" />
                <span className="flex-1">{it.label}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setChecklist((prev) => prev.filter((c) => c.id !== it.id))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Collapsible open={showMore} onOpenChange={setShowMore}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2">
            {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Mais opções
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
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
              <Label>Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(clients as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Projeto</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(projects as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );

  const Footer = (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
      <Button
        className="bg-[#00D084] hover:bg-[#00b873] text-white"
        disabled={!canSubmit || create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending ? "Criando..." : (kind === "reuniao" ? "Agendar reunião" : "Criar tarefa")}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto">
          <SheetHeader className="text-left mb-3">
            <SheetTitle>{kind === "reuniao" ? "Nova reunião" : "Nova tarefa"}</SheetTitle>
          </SheetHeader>
          {Body}
          <div className="pt-4 pb-2 border-t mt-4">{Footer}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind === "reuniao" ? "Nova reunião" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>
        {Body}
        <DialogFooter className="pt-2">{Footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
