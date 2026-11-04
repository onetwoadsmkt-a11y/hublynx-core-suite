import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { deleteLeadTask, toggleLeadTask, upsertLeadTask } from "@/lib/pipeline/pipeline.functions";
import type { LeadScheduledTask } from "@/lib/pipeline/task-display";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invalidatePendingQueries } from "@/hooks/usePendingItems";
import { OpenLeadButton } from "@/components/pipeline/LeadCardHost";
import { LeadTaskActions, LeadTaskNotes } from "@/components/pipeline/LeadTaskActions";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { TASK_KIND_OPTIONS, type TaskKind } from "@/components/tasks/TaskCreateDialog";
import { dueToLocalInput, localInputToIso } from "@/lib/tasks/due";

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
  const notes = task.notes ?? "";
  // horário de Brasília (antes o campo usava o fuso do navegador)
  const [due, setDue] = useState(dueToLocalInput(task.due_at));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [priority, setPriority] = useState<LeadPriority>((task.priority ?? "media") as LeadPriority);
  const [kind, setKind] = useState<TaskKind>(
    (["tarefa", "reuniao", "call", "follow_up"].includes(task.kind) ? task.kind : "tarefa") as TaskKind,
  );
  const [duration, setDuration] = useState(String(task.duration_minutes ?? 30));
  const [invite, setInvite] = useState(false);
  const { data: leadEmail } = useQuery({
    queryKey: ["lead-email", task.lead_id],
    queryFn: async () => ((await supabase.from("leads").select("email").eq("id", task.lead_id).maybeSingle()).data?.email as string | null) ?? null,
    staleTime: 60_000,
  });
  const durations = Array.from(new Set(["15", "30", "45", "60", "90", "120", duration]))
    .sort((a, b) => Number(a) - Number(b));
  const mutate = useMutation({
    mutationFn: async (action: "save" | "toggle" | "delete") => {
      if (action === "delete") return deleteFn({ data: { id: task.id } });
      if (action === "toggle") return toggleFn({ data: { id: task.id, done: !task.done } });
      const result = await saveFn({
        data: {
          id: task.id,
          leadId: task.lead_id,
          title: title.trim(),
          notes: notes || null,
          due_at: due ? localInputToIso(due) : null,
          kind,
          duration_minutes: Math.min(480, Math.max(10, Number(duration) || 30)),
          // só manda convite quando marcado; sem marcar, quem já foi convidado continua convidado
          ...(invite && leadEmail ? { invite_lead: true } : {}),
          priority,
        },
      });
      if (result.priorityPending) toast.warning("Salvo, mas a prioridade só é gravada depois de rodar a migração 21 no banco.");
      if (result.syncError) toast.warning(`Agendamento salvo; o Google Agenda não foi atualizado (${result.syncError}).`);
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-sm text-muted-foreground">Lead: <strong className="text-foreground">{task.leads.name}</strong></span>
            <OpenLeadButton leadId={task.lead_id} label="Abrir card do lead" onBeforeOpen={onClose} />
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="lead-task-title">Título</Label><Input id="lead-task-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4">
              {TASK_KIND_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  onClick={() => setKind(value)}
                  className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition ${kind === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1"><Label htmlFor="lead-task-due">Data e horário</Label><Input id="lead-task-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Duração</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger aria-label="Duração" className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {durations.map((m) => <SelectItem key={m} value={m}>{m} min</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {kind === "reuniao" && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={invite && !!leadEmail} disabled={!leadEmail} onCheckedChange={(v) => setInvite(!!v)} />
              {leadEmail ? `Enviar convite ao lead (${leadEmail})` : "Lead sem e-mail para convite"}
            </label>
          )}
          <div className="space-y-1">
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as LeadPriority)}>
              <SelectTrigger aria-label="Prioridade"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Observações</Label>
            <LeadTaskNotes notes={task.notes} />
            {!task.notes && task.done && <p className="text-xs text-muted-foreground">Sem observações.</p>}
            {/* Observação, conclusão com resultado e próxima ação: tudo vai para a jornada do lead. */}
            <LeadTaskActions task={task} onCompleted={onClose} />
          </div>
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
            {task.done && <Button variant="outline" onClick={() => mutate.mutate("toggle")} disabled={mutate.isPending}><RotateCcw />Reabrir</Button>}
            <Button onClick={() => mutate.mutate("save")} disabled={mutate.isPending || !title.trim()}><Save />Salvar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}