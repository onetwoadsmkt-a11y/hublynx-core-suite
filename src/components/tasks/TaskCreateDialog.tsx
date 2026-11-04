import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarCheck, ListTodo, Phone, Repeat, Search, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRIORITY_LABEL, type Priority } from "@/components/tasks/TaskDrawer";
import { syncEntityToSheets } from "@/lib/google/sheets-sync.functions";
import { syncTaskToCalendar } from "@/lib/google/calendar.functions";
import { upsertLeadTask } from "@/lib/pipeline/pipeline.functions";
import { listTaskAssignees } from "@/lib/tasks/assignees.functions";
import { invalidatePendingQueries } from "@/hooks/usePendingItems";
import { scopeOrganization } from "@/lib/org/filter";
import { cn } from "@/lib/utils";
import { dueFromParts, leadDueFromParts, todayKeyBR } from "@/lib/tasks/due";

/**
 * Criação de tarefa padrão do Core (Agenda, Tarefas, app do celular e cartão do lead):
 * título, descrição, lead vinculado, data, hora e tipo — mesmo layout em todo lugar.
 * Com lead: vira agendamento do lead (aparece no cartão, na jornada e na Agenda em laranja).
 * Sem lead: vira tarefa da agenda (pode levar projeto/cliente/coluna quando aberta de lá).
 */

export type TaskKind = "tarefa" | "reuniao" | "call" | "follow_up";

export const TASK_KIND_OPTIONS: { value: TaskKind; label: string; icon: typeof ListTodo }[] = [
  { value: "tarefa", label: "Tarefa", icon: ListTodo },
  { value: "reuniao", label: "Reunião", icon: CalendarCheck },
  { value: "call", label: "Ligação", icon: Phone },
  { value: "follow_up", label: "Follow-up", icon: Repeat },
];

export type TaskCreateDefaults = {
  kind?: TaskKind | "evento";
  date?: string; // aaaa-mm-dd
  time?: string; // HH:mm
  projectId?: string | null;
  clientId?: string | null;
  /** coluna do quadro (Tarefas › Kanban) */
  status?: string;
  lead?: { id: string; name: string; email?: string | null } | null;
};

type LeadPick = { id: string; name: string; company?: string | null; email?: string | null; phone?: string | null };

const todayKey = todayKeyBR;

export function TaskCreateDialog({
  open,
  onOpenChange,
  defaults,
  lockLead = false,
  projectName,
  clientName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaults?: TaskCreateDefaults;
  /** aberto no cartão do lead: o lead fica fixo */
  lockLead?: boolean;
  projectName?: string | null;
  clientName?: string | null;
  onCreated?: (id: string, info: { lead: boolean }) => void;
}) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { activeOrganizationId } = useWorkspace();
  const syncSheet = useServerFn(syncEntityToSheets);
  const syncCalendar = useServerFn(syncTaskToCalendar);
  const leadTaskFn = useServerFn(upsertLeadTask);

  const initialKind = (k?: TaskCreateDefaults["kind"]): TaskKind => (k === "evento" || !k ? "tarefa" : k);
  const [kind, setKind] = useState<TaskKind>(initialKind(defaults?.kind));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lead, setLead] = useState<LeadPick | null>(defaults?.lead ?? null);
  const [date, setDate] = useState(defaults?.date ?? todayKey());
  const [time, setTime] = useState(defaults?.time ?? "");
  const [priority, setPriority] = useState<Priority>("media");
  const [duration, setDuration] = useState("30");
  const [invite, setInvite] = useState(true);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [assignee, setAssignee] = useState<string>("none");
  const [stageId, setStageId] = useState<string>("none");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [checkInput, setCheckInput] = useState("");
  const projectId = defaults?.projectId ?? null;

  useEffect(() => {
    if (!open) return;
    setKind(initialKind(defaults?.kind));
    setTitle("");
    setDescription("");
    setLead(defaults?.lead ?? null);
    setDate(defaults?.date ?? todayKey());
    setTime(defaults?.time ?? "");
    setPriority("media");
    setDuration("30");
    setInvite(true);
    setTerm("");
    setAssignee("none");
    setStageId("none");
    setChecklist([]);
    setCheckInput("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  // busca de leads da empresa (nome, empresa, telefone ou e-mail)
  const leadsQ = useQuery({
    queryKey: ["task-lead-search", activeOrganizationId, debounced],
    enabled: open && !lockLead && !lead && debounced.length >= 2,
    queryFn: async (): Promise<LeadPick[]> => {
      const t = debounced.replace(/[%,()]/g, " ");
      const { data, error } = await scopeOrganization(
        supabase
          .from("leads")
          .select("id, name, company, email, phone")
          .or(`name.ilike.%${t}%,company.ilike.%${t}%,phone.ilike.%${t}%,email.ilike.%${t}%`)
          .order("created_at", { ascending: false })
          .limit(12),
        activeOrganizationId,
      );
      if (error) throw error;
      return (data ?? []) as LeadPick[];
    },
  });

  // Responsável (equipe do projeto ou da empresa): recebe aviso no sino e por e-mail
  const assigneesFn = useServerFn(listTaskAssignees);
  const peopleQ = useQuery({
    queryKey: ["task-assignees", activeOrganizationId, projectId],
    enabled: open && !!activeOrganizationId,
    queryFn: () => assigneesFn({ data: { organizationId: activeOrganizationId!, projectId } }),
    staleTime: 60_000,
  });
  // Etapas do projeto: a tarefa entra numa etapa para aparecer em Projetos › Etapas
  const stagesQ = useQuery({
    queryKey: ["task-create-stages", projectId],
    enabled: open && !!projectId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_stages")
        .select("id, name, status, sort_order")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; status: string }[];
    },
  });
  useEffect(() => {
    if (!open || stageId !== "none" || !stagesQ.data?.length) return;
    setStageId((stagesQ.data.find((st) => st.status !== "done") ?? stagesQ.data[0]).id);
  }, [open, stagesQ.data, stageId]);
  const addCheck = () => {
    const v = checkInput.trim();
    if (!v) return;
    setChecklist((c) => [...c, v]);
    setCheckInput("");
  };

  const needTime = kind === "reuniao" || kind === "call";
  const canSubmit = useMemo(
    () => !!title.trim() && !!date && (!needTime || !!time),
    [title, date, time, needTime],
  );

  const create = useMutation({
    mutationFn: async (): Promise<{ id: string; lead: boolean; synced?: boolean; syncError?: string | null }> => {
      if (lead) {
        // Agendamento do lead: dono = quem cria; Google Agenda sincroniza no servidor
        const dueIso = leadDueFromParts(date, time);
        if (!dueIso) throw new Error("Data inválida.");
        const res: any = await leadTaskFn({
          data: {
            leadId: lead.id,
            title: title.trim(),
            kind,
            notes: description.trim() || null,
            due_at: dueIso,
            duration_minutes: Number(duration),
            invite_lead: kind === "reuniao" && invite && !!lead.email,
            priority,
          },
        });
        return { id: (res?.id as string) ?? lead.id, lead: true, synced: !!res?.synced, syncError: res?.syncError ?? null };
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      // sem hora = dia inteiro (meia-noite UTC); com hora = horário de Brasília
      const dueIso = dueFromParts(date, time);
      if (!dueIso) throw new Error("Data inválida.");
      const stage = projectId && stageId !== "none" ? stageId : null;
      let position = 0;
      if (stage) {
        // nova tarefa entra no fim da sequência da etapa
        const { data: last } = await (supabase as any)
          .from("tasks")
          .select("position")
          .eq("stage_id", stage)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        position = (Number(last?.position) || 0) + 1;
      }
      const { data: inserted, error } = await supabase
        .from("tasks")
        .insert({
          owner_id: u.user.id,
          stage_id: stage,
          assignee_id: assignee !== "none" ? assignee : null,
          ...(activeOrganizationId ? { organization_id: activeOrganizationId } : {}),
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status: defaults?.status ?? "a_fazer",
          project_id: defaults?.projectId ?? null,
          client_id: defaults?.clientId ?? null,
          due_date: dueIso,
          position,
          briefing: { type: kind } as any,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      if (checklist.length) {
        const { error: cErr } = await supabase.from("task_checklists").insert(
          checklist.map((label, i) => ({ task_id: inserted.id, owner_id: u.user!.id, label, done: false, position: i })) as never,
        );
        if (cErr) toast.warning(`Tarefa criada, mas o checklist não foi salvo: ${cErr.message}`);
      }
      return { id: inserted.id as string, lead: false };
    },
    onSuccess: (r) => {
      toast.success(r.lead ? `Agendado para ${lead?.name ?? "o lead"}.` : "Tarefa criada na agenda.");
      invalidatePendingQueries(qc, lead?.id ?? null);
      for (const key of [["project-dashboard"], ["project-stage-tasks"], ["lead-tasks"], ["pipeline"]]) qc.invalidateQueries({ queryKey: key });
      onCreated?.(r.id, { lead: r.lead });
      onOpenChange(false);
      if (r.lead) {
        if (r.syncError) toast.error(`Salvo, mas o Google Agenda falhou: ${r.syncError}`);
        return;
      }
      syncSheet({ data: { entityType: "task", recordId: r.id } }).catch(() => {});
      syncCalendar({ data: { taskId: r.id, withMeet: kind === "reuniao" } }).catch(() => {});
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível criar"),
  });

  const Body = (
    <div className="space-y-4">
      {(projectName || clientName) && (
        <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          {projectName && <div><span className="font-medium text-foreground">Projeto:</span> {projectName}</div>}
          {clientName && <div><span className="font-medium text-foreground">Cliente:</span> {clientName}</div>}
        </div>
      )}

      <div className="space-y-2">
        <Label>Tipo de tarefa</Label>
        <div role="radiogroup" aria-label="Tipo de tarefa" className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-1 sm:grid-cols-4">
          {TASK_KIND_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              onClick={() => setKind(value)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition",
                kind === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tc-title">Título da tarefa *</Label>
        <Input
          id="tc-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "reuniao" ? "Ex.: Reunião de apresentação" : "Ex.: Enviar proposta"}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tc-desc">Descrição</Label>
        <Textarea id="tc-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Detalhes, pauta ou próximos passos" />
      </div>

      <div className="space-y-2">
        <Label>Vincular lead</Label>
        {lead ? (
          <div className="flex items-center gap-2 rounded-md border bg-amber-50 px-3 py-2 text-sm dark:bg-amber-500/10">
            <UserRound className="h-4 w-4 shrink-0 text-amber-700" />
            <span className="min-w-0 flex-1 truncate font-medium">
              {lead.name}
              {lead.company ? <span className="font-normal text-muted-foreground"> · {lead.company}</span> : null}
            </span>
            {!lockLead && (
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Remover lead" onClick={() => setLead(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar lead por nome, empresa ou telefone (opcional)" className="pl-8" />
            {debounced.length >= 2 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                {leadsQ.isLoading ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">Buscando…</p>
                ) : (leadsQ.data ?? []).length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum lead encontrado.</p>
                ) : (
                  (leadsQ.data ?? []).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => { setLead(l); setTerm(""); }}
                      className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-medium">{l.name}</span>
                      <span className="text-[11px] text-muted-foreground">{[l.company, l.phone, l.email].filter(Boolean).join(" · ") || "—"}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {lead ? "Fica no cartão do lead, na jornada dele e na Agenda (laranja)." : "Sem lead, vira uma tarefa da sua agenda."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="tc-date">Data *</Label>
          <Input id="tc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tc-time">Hora{needTime ? " *" : ""}</Label>
          <Input id="tc-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
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
        {lead && (
          <div className="space-y-2">
            <Label>Duração</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["15", "30", "45", "60", "90", "120"].map((m) => <SelectItem key={m} value={m}>{m} min</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!lead && (
        <div className={cn("grid gap-3", projectId && (stagesQ.data?.length ?? 0) > 0 ? "grid-cols-2" : "grid-cols-1")}>
          <div className="space-y-2">
            <Label>Responsável</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger aria-label="Responsável"><SelectValue placeholder="Eu mesmo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Eu mesmo (sem responsável)</SelectItem>
                {(peopleQ.data ?? []).map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {projectId && (stagesQ.data?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <Label>Etapa do projeto</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger aria-label="Etapa do projeto"><SelectValue placeholder="Escolha a etapa" /></SelectTrigger>
                <SelectContent>
                  {(stagesQ.data ?? []).map((st) => <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
      {!lead && assignee !== "none" && (
        <p className="-mt-2 text-[11px] text-muted-foreground">A pessoa recebe o aviso no sino e por e-mail.</p>
      )}

      {!lead && (
        <div className="space-y-2">
          <Label htmlFor="tc-check">Checklist</Label>
          {checklist.length > 0 && (
            <ul className="space-y-1">
              {checklist.map((c, i) => (
                <li key={`${i}-${c}`} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                  <span className="min-w-0 flex-1 truncate">{c}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Remover item" onClick={() => setChecklist((l) => l.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              id="tc-check"
              value={checkInput}
              onChange={(e) => setCheckInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCheck(); } }}
              placeholder="Adicionar item (opcional)"
            />
            <Button type="button" variant="outline" onClick={addCheck} disabled={!checkInput.trim()}>Adicionar</Button>
          </div>
        </div>
      )}

      {lead && kind === "reuniao" && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={invite && !!lead.email} disabled={!lead.email} onCheckedChange={(v) => setInvite(!!v)} />
          Convidar o lead por e-mail{lead.email ? ` (${lead.email})` : " (lead sem e-mail)"} · gera o link do Meet
        </label>
      )}
      {!time && !needTime && (
        <p className="text-[11px] text-muted-foreground">Sem hora: fica como tarefa do dia{lead ? " (agendada às 9h)" : ""}.</p>
      )}
    </div>
  );

  const Footer = (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
      <Button disabled={!canSubmit || create.isPending} onClick={() => create.mutate()}>
        {create.isPending ? "Salvando…" : lead ? "Agendar" : "Criar tarefa"}
      </Button>
    </div>
  );

  const heading = lockLead && lead ? `Nova tarefa · ${lead.name}` : "Nova tarefa";
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader className="mb-3 text-left"><SheetTitle>{heading}</SheetTitle></SheetHeader>
          {Body}
          <div className="mt-4 border-t pb-2 pt-4">{Footer}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{heading}</DialogTitle></DialogHeader>
        {Body}
        <DialogFooter className="pt-2">{Footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
