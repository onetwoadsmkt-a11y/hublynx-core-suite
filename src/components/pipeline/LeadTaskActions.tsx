import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, Check, MessageSquarePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addLeadTaskNote, completeLeadTask } from "@/lib/pipeline/pipeline.functions";
import { defaultNextDue, noteLines } from "@/lib/pipeline/lead-task-notes";
import { invalidatePendingQueries } from "@/hooks/usePendingItems";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "follow_up", label: "Follow-up" },
  { value: "reuniao", label: "Reunião" },
  { value: "call", label: "Ligação" },
  { value: "tarefa", label: "Outra tarefa" },
] as const;
type Kind = (typeof KINDS)[number]["value"];

const PRIORITIES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Urgente" },
] as const;
type Priority = (typeof PRIORITIES)[number]["value"];

const DEFAULT_TITLE: Record<Kind, string> = {
  follow_up: "Follow-up",
  reuniao: "Reunião",
  call: "Ligação",
  tarefa: "",
};

type TaskLike = { id: string; lead_id: string; title: string; notes: string | null; done: boolean };

/** Observações do agendamento, em linhas datadas. */
export function LeadTaskNotes({ notes, className }: { notes: string | null; className?: string }) {
  const lines = noteLines(notes);
  if (lines.length === 0) return null;
  return (
    <ul className={cn("space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground", className)}>
      {lines.slice(-6).map((l, i) => (
        <li key={i} className={cn("whitespace-pre-wrap break-words", /\] Resultado: /.test(l) && "font-medium text-foreground")}>{l}</li>
      ))}
      {lines.length > 6 && <li className="italic">+{lines.length - 6} anteriores</li>}
    </ul>
  );
}

/**
 * Ações de um agendamento pendente, no estilo do Kommo:
 * caixa de texto para observação/resultado, "Tarefa concluída" e, ao concluir,
 * a próxima ação já agendada (Core + Google Agenda). Tudo vai para a jornada do lead.
 */
export function LeadTaskActions({
  task, leadEmail, onCompleted,
}: { task: TaskLike; leadEmail?: string | null; onCompleted?: () => void }) {
  const qc = useQueryClient();
  const noteFn = useServerFn(addLeadTaskNote);
  const completeFn = useServerFn(completeLeadTask);
  const [text, setText] = useState("");
  const [completing, setCompleting] = useState(false);
  const [withNext, setWithNext] = useState(true);
  const [kind, setKind] = useState<Kind>("follow_up");
  const [title, setTitle] = useState(DEFAULT_TITLE.follow_up);
  const [due, setDue] = useState(defaultNextDue());
  const [duration, setDuration] = useState("30");
  const [priority, setPriority] = useState<Priority>("media");
  const [invite, setInvite] = useState(false);

  const refresh = () => invalidatePendingQueries(qc, task.lead_id);

  const saveNote = useMutation({
    mutationFn: () => noteFn({ data: { id: task.id, text: text.trim() } }),
    onSuccess: () => { setText(""); toast.success("Observação registrada na jornada."); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: () =>
      completeFn({
        data: {
          id: task.id,
          result: text.trim() || undefined,
          next: withNext
            ? {
                title: title.trim() || KINDS.find((k) => k.value === kind)!.label,
                kind,
                due_at: due ? new Date(due).toISOString() : null,
                duration_minutes: Number(duration),
                priority,
                invite_lead: invite && !!leadEmail,
                notes: null,
              }
            : undefined,
        },
      }),
    onSuccess: (res: any) => {
      const n = res?.next;
      if (n?.syncError) toast.warning(`Concluída e próxima ação agendada, mas o Google Agenda falhou: ${n.syncError}`);
      else if (n?.priorityPending) toast.warning("Concluída e próxima ação agendada; a prioridade só é salva depois da migração 21.");
      else if (n) toast.success(n.synced ? "Concluída. Próxima ação agendada e sincronizada no Google Agenda." : "Concluída. Próxima ação agendada.");
      else toast.success("Tarefa concluída.");
      setText(""); setCompleting(false);
      refresh();
      onCompleted?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (task.done) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={completing ? "Resultado (opcional): como foi?" : "Adicionar observação ou resultado"}
          maxLength={2000}
          rows={2}
          className="min-h-[44px] flex-1 resize-y text-sm"
          aria-label={`Observação de ${task.title}`}
        />
        {!completing && (
          <div className="flex shrink-0 gap-2 sm:flex-col">
            <Button
              variant="outline" size="sm" className="flex-1"
              disabled={!text.trim() || saveNote.isPending}
              onClick={() => saveNote.mutate()}
            >
              <MessageSquarePlus className="mr-1 h-4 w-4" /> Salvar
            </Button>
            <Button size="sm" className="flex-1" onClick={() => setCompleting(true)}>
              <Check className="mr-1 h-4 w-4" /> Tarefa concluída
            </Button>
          </div>
        )}
      </div>

      {completing && (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            <span className="flex items-center gap-2"><CalendarPlus className="h-4 w-4 text-primary" /> Agendar próxima ação</span>
            <Switch checked={withNext} onCheckedChange={setWithNext} aria-label="Agendar próxima ação" />
          </label>

          {withNext && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => {
                    const k = v as Kind;
                    if (!title.trim() || title === DEFAULT_TITLE[kind]) setTitle(DEFAULT_TITLE[k]);
                    setKind(k);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Título</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex.: Enviar proposta" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data e horário</Label>
                <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Duração</Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["15", "30", "45", "60", "90", "120"].map((m) => <SelectItem key={m} value={m}>{m} min</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Prioridade</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {leadEmail && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                  <Checkbox checked={invite} onCheckedChange={(v) => setInvite(!!v)} />
                  Convidar o lead por e-mail ({leadEmail})
                </label>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCompleting(false)} disabled={complete.isPending}>
              <X className="mr-1 h-4 w-4" /> Cancelar
            </Button>
            <Button size="sm" onClick={() => complete.mutate()} disabled={complete.isPending || (withNext && !due)}>
              <Check className="mr-1 h-4 w-4" />
              {complete.isPending ? "Salvando..." : withNext ? "Concluir e agendar" : "Concluir"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
