import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useKanbanColumns, DEFAULT_STATUS_COLS } from "@/hooks/useKanbanColumns";
import { PRIORITY_LABEL, type Priority, type TaskStatus } from "@/components/tasks/TaskDrawer";
import { syncEntityToSheets } from "@/lib/google/sheets-sync.functions";
import { syncTaskToCalendar } from "@/lib/google/calendar.functions";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultProjectId?: string | null;
  defaultClientId?: string | null;
  projectName?: string | null;
  clientName?: string | null;
  onCreated?: (id: string) => void;
}

export function NewTaskSheet({
  open, onOpenChange, defaultProjectId, defaultClientId, projectName, clientName, onCreated,
}: Props) {
  const qc = useQueryClient();
  const { activeOrganizationId } = useWorkspace();
  const syncSheet = useServerFn(syncEntityToSheets);
  const syncCalendar = useServerFn(syncTaskToCalendar);
  const { data: kanbanCols = DEFAULT_STATUS_COLS } = useKanbanColumns();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [status, setStatus] = useState<TaskStatus>("a_fazer");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [taskType, setTaskType] = useState<"tarefa" | "reuniao" | "evento">("tarefa");

  useEffect(() => {
    if (open) {
      setTitle(""); setDescription(""); setPriority("media");
      setStatus("a_fazer"); setDueDate(""); setDueTime(""); setTaskType("tarefa");
    }
  }, [open]);

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      let dueIso: string | null = null;
      if (dueDate) {
        const iso = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T00:00:00`;
        dueIso = new Date(iso).toISOString();
      }
      const { data: inserted, error } = await supabase.from("tasks").insert({
        owner_id: u.user.id,
        ...(activeOrganizationId ? { organization_id: activeOrganizationId } : {}),
        title,
        description: description || null,
        priority,
        status,
        project_id: defaultProjectId ?? null,
        client_id: defaultClientId ?? null,
        due_date: dueIso,
        position: 0,
        briefing: { type: taskType } as any,
      } as never).select("id").single();
      if (error) throw error;
      return inserted.id as string;
    },
    onSuccess: (id) => {
      toast.success("Tarefa criada.");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["project-dashboard"] });
      qc.invalidateQueries({ queryKey: ["project-stage-tasks"] });
      qc.invalidateQueries({ queryKey: ["hub-today"] });
      onCreated?.(id);
      onOpenChange(false);
      syncSheet({ data: { entityType: "task", recordId: id } }).catch(() => {});
      if (dueDate) {
        qc.invalidateQueries({ queryKey: ["agenda"] });
        syncCalendar({
          data: { taskId: id, withMeet: taskType === "reuniao" },
        })
          .then(() => toast.success("Sincronizado com Google Agenda."))
          .catch((e: any) => toast.error(`Falha ao sincronizar com Google Agenda: ${e.message}`));
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle>Nova tarefa</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-auto space-y-4 py-4">
          {(projectName || clientName) && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              {projectName && <div><span className="font-medium text-foreground">Projeto:</span> {projectName}</div>}
              {clientName && <div><span className="font-medium text-foreground">Cliente:</span> {clientName}</div>}
            </div>
          )}
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Revisar campanha de junho" />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Tipo</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as typeof taskType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tarefa">Tarefa</SelectItem>
                  <SelectItem value="reuniao">Reunião</SelectItem>
                  <SelectItem value="evento">Evento</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                  {kanbanCols.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!title || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Criando..." : "Criar tarefa"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
