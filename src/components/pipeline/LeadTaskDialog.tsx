import { useState } from "react";
import { format, parseISO } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { deleteLeadTask, toggleLeadTask, upsertLeadTask } from "@/lib/pipeline/pipeline.functions";
import type { LeadScheduledTask } from "@/lib/pipeline/task-display";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invalidatePendingQueries } from "@/hooks/usePendingItems";
import { LeadLink } from "@/components/pipeline/LeadCardHost";

const PRIORITIES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Urgente" },
] as const;
type LeadPriority = (typeof PRIORITIES)[number]["value"];

export function LeadTaskDialog({ task, onClose }: { task: LeadScheduledTask; onClose: () => void }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(upsertLeadTask);
  const toggleFn = useServerFn(toggleLeadTask);
  const deleteFn = useServerFn(deleteLeadTask);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [due, setDue] = useState(task.due_at ? format(parseISO(task.due_at), "yyyy-MM-dd'T'HH:mm") : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [priority, setPriority] = useState<LeadPriority>((task.priority ?? "media") as LeadPriority);
  const mutate = useMutation({
    mutationFn: async (action: "save" | "toggle" | "delete") => {
      if (action === "delete") return deleteFn({ data: { id: task.id } });
      if (action === "toggle") return toggleFn({ data: { id: task.id, done: !task.done } });
      const kind = ["tarefa", "reuniao", "call", "follow_up"].includes(task.kind) ? task.kind as "tarefa" | "reuniao" | "call" | "follow_up" : "tarefa";
      const result = await saveFn({ data: { id: task.id, leadId: task.lead_id, title: title.trim(), notes: notes || null, due_at: due ? new Date(due).toISOString() : null, kind, duration_minutes: task.duration_minutes, invite_lead: false, priority } });
      if (result.priorityPending) toast.warning("Salvo, mas a prioridade só é gravada depois de rodar a migração 21 no banco.");
      if (result.syncError) toast.warning("Tarefa salva; não foi possível atualizar o Google Agenda.");
      return result;
    },
    onSuccess: () => {
      invalidatePendingQueries(qc, task.lead_id);
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agendamento</DialogTitle>
          <LeadLink leadId={task.lead_id} name={task.leads.name} className="text-sm" prefix="Abrir cartão do lead · " />
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="lead-task-title">Título</Label><Input id="lead-task-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="lead-task-due">Data e horário</Label><Input id="lead-task-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as LeadPriority)}>
              <SelectTrigger aria-label="Prioridade"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="lead-task-notes">Anotações</Label><Textarea id="lead-task-notes" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} /></div>
          {task.meet_link && <a className="text-sm text-primary underline" href={task.meet_link} target="_blank" rel="noreferrer">Abrir reunião</a>}
        </div>
        {confirmDelete ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-sm">Excluir este agendamento?</p>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={mutate.isPending} onClick={() => mutate.mutate("delete")}>Excluir</Button>
          </div>
        ) : (
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="icon" aria-label="Excluir agendamento" title="Excluir agendamento" onClick={() => setConfirmDelete(true)} disabled={mutate.isPending}><Trash2 /></Button>
            <Button variant="outline" onClick={() => mutate.mutate("toggle")} disabled={mutate.isPending}>{task.done ? <RotateCcw /> : <Check />}{task.done ? "Reabrir" : "Concluir"}</Button>
            <Button onClick={() => mutate.mutate("save")} disabled={mutate.isPending || !title.trim()}><Save />Salvar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}