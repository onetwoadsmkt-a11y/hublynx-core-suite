import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  const syncSheet = useServerFn(syncEntityToSheets);
  const { data: kanbanCols = DEFAULT_STATUS_COLS } = useKanbanColumns();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [status, setStatus] = useState<TaskStatus>("a_fazer");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(""); setDescription(""); setPriority("media");
      setStatus("a_fazer"); setDueDate("");
    }
  }, [open]);

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { data: inserted, error } = await supabase.from("tasks").insert({
        owner_id: u.user.id,
        title,
        description: description || null,
        priority,
        status,
        project_id: defaultProjectId ?? null,
        client_id: defaultClientId ?? null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        position: 0,
      }).select("id").single();
      if (error) throw error;
      return inserted.id as string;
    },
    onSuccess: (id) => {
      toast.success("Tarefa criada.");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["project-detail"] });
      onOpenChange(false);
      syncSheet({ data: { entityType: "task", recordId: id } }).catch(() => {});
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
            <div className="space-y-2 col-span-2">
              <Label>Prazo</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="bg-[#00D084] hover:bg-[#00b873] text-white"
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
