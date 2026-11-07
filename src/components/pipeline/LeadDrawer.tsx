import { DuplicateBadge } from "@/components/pipeline/DuplicateLeadDialog";
import { useDraft } from "@/lib/persist/draft";
import { leadCardHref } from "@/lib/persist/lead-url";
import { dropQueuedFile, enqueueLeadFile, isNetworkError, queuedLeadFiles, type QueuedFile } from "@/lib/persist/upload-queue";
import { leadFileUrl, removeLeadFile, uploadLeadFile } from "@/lib/pipeline/lead-files.functions";
import { ACCEPT_ATTACHMENTS, MAX_ATTACHMENT_MB } from "@/lib/projects/attachments.functions";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, ArrowRightLeft, Building2, CalendarClock, CalendarDays, CheckCircle2, Download, FileUp,
  AlertTriangle, Mail, MapPin, MessageSquare, Paperclip, Pencil, Phone, Plus, Tag, Trash2, X, Zap,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  addLeadNote, deleteLeadTask, getLeadDetail, listAllStages, moveLead,
  toggleLeadTask, upsertLeadTask,
} from "@/lib/pipeline/pipeline.functions";
import { setLeadTags } from "@/lib/pipeline/tags.functions";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { currency, LeadQualificationBadge } from "./LeadCard";
import { buildLeadAnswers, leadOrigins, useLeadAnswerLabels } from "./lead-answers";
import { SendLeadEmailDialog } from "./SendLeadEmailDialog";
import type { Lead, LeadEvent, LeadNote, PipelineStage } from "./types";
import { useWorkspace } from "@/hooks/useWorkspace";
import { invalidatePendingQueries } from "@/hooks/usePendingItems";
import { LeadTaskActions, LeadTaskNotes } from "./LeadTaskActions";
import { TaskCreateDialog } from "@/components/tasks/TaskCreateDialog";
import { PRIORITY_LABEL, PRIORITY_TONE, type Priority } from "@/components/tasks/TaskDrawer";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const EVENT_ICON: Record<string, typeof Activity> = {
  created: Plus,
  stage_changed: ArrowRightLeft,
  note: MessageSquare,
  note_added: MessageSquare,
  task_created: CalendarClock,
  task_done: CheckCircle2,
  task_note: MessageSquare,
  task_result: CheckCircle2,
  next_action: CalendarClock,
  automation: Zap,
  file_added: Paperclip,
  email_sent: Mail,
  tag_added: Tag,
  tag_removed: Tag,
  project_message: MessageSquare,
};

const LEAD_TASK_PRIORITIES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Urgente" },
] as const;

const TASK_KINDS = [
  { value: "tarefa", label: "Tarefa" },
  { value: "reuniao", label: "Reunião" },
  { value: "call", label: "Ligação" },
  { value: "follow_up", label: "Follow-up" },
] as const;

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function bytes(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function findNoteFromEvent(ev: LeadEvent, notes: LeadNote[]): LeadNote | undefined {
  if (ev.kind !== "note" && ev.kind !== "note_added") return undefined;
  const noteId = (ev.meta as { note_id?: string } | null)?.note_id;
  if (noteId) return notes.find((n) => n.id === noteId);
  const body = ev.description ?? "";
  return notes.find((n) => n.body.startsWith(body) || body.startsWith(n.body));
}

export function LeadDrawer({
  lead,
  stages,
  tags = [],
  onOpenChange,
  onEdit,
  onConfigureTags,
  onWin,
}: {
  lead: Lead | null;
  stages: PipelineStage[];
  tags?: { slug: string; name: string; color: string; funnel_key?: string }[];
  onOpenChange: (v: boolean) => void;
  onEdit: (lead: Lead) => void;
  onConfigureTags?: () => void;
  onWin?: (lead: Lead) => void;
}) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getLeadDetail);
  const moveFn = useServerFn(moveLead);
  const allStagesFn = useServerFn(listAllStages);
  const { activeOrganizationId } = useWorkspace();
  const taskFn = useServerFn(upsertLeadTask);
  const toggleFn = useServerFn(toggleLeadTask);
  const delTaskFn = useServerFn(deleteLeadTask);

  const noteFn = useServerFn(addLeadNote);

  const [emailOpen, setEmailOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<LeadNote | null>(null);
  // anotação em andamento fica guardada neste aparelho até ser adicionada
  const noteDraft = useDraft<string>(lead ? `lead-note:${lead.id}` : null, "");
  const noteText = noteDraft.value;
  const setNoteText = noteDraft.set;
  // aba da direita (Tarefas/Arquivos/UTM) lembrada por lead nesta aba do navegador
  const tabKey = lead ? `lead-tab:${lead.id}` : null;
  const [sideTab, setSideTabState] = useState<string>("tarefas");
  useEffect(() => {
    if (!tabKey) return;
    try { setSideTabState(sessionStorage.getItem(tabKey) ?? "tarefas"); } catch { setSideTabState("tarefas"); }
  }, [tabKey]);
  const setSideTab = (v: string) => {
    setSideTabState(v);
    try { if (tabKey) sessionStorage.setItem(tabKey, v); } catch { /* sem armazenamento */ }
  };
  // anexos aguardando envio (internet caiu ou página recarregada no meio)
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskKind, setTaskKind] = useState<string>("tarefa");
  const [taskDue, setTaskDue] = useState("");
  const [taskDuration, setTaskDuration] = useState("30");
  const [taskPriority, setTaskPriority] = useState<"baixa" | "media" | "alta" | "critica">("media");
  const [inviteLead, setInviteLead] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const leadTags = ((lead as any)?.tags as string[] | null) ?? [];
  const [selTags, setSelTags] = useState<string[]>(leadTags.map(String));
  useEffect(() => {
    setSelTags((((lead as any)?.tags as string[] | null) ?? []).map(String));
  }, [lead]);
  const hasTag = (slug: string) => selTags.some((s) => s.toLowerCase() === slug.toLowerCase());
  const shownTags = tags.filter((t) => hasTag(t.slug));
  const saveTagsFn = useServerFn(setLeadTags);
  const tagMut = useMutation({
    mutationFn: (next: string[]) => saveTagsFn({ data: { leadId: lead!.id, tags: next } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["lead-detail", lead?.id] });
    },
    onError: (e: Error) => {
      setSelTags(leadTags.map(String));
      toast.error(e.message);
    },
  });
  const toggleTag = (slug: string) => {
    const marking = !hasTag(slug);
    const next = marking ? [...selTags, slug] : selTags.filter((s) => s.toLowerCase() !== slug.toLowerCase());
    setSelTags(next);
    // ao MARCAR uma tag de ganho (funnel_key), abre a conversão em cliente/projeto
    const cfg = tags.find((t) => t.slug.toLowerCase() === slug.toLowerCase());
    const isWinTag = marking && cfg?.funnel_key === "ganho";
    const alreadyConverted = !!(lead as any)?.converted_project_id;
    const current = lead;
    tagMut.mutate(next, {
      onSuccess: () => {
        if (isWinTag && !alreadyConverted && current && onWin) onWin(current);
      },
    });
  };


  const { data } = useQuery({
    queryKey: ["lead-detail", lead?.id],
    queryFn: () => detailFn({ data: { leadId: lead!.id } }),
    enabled: !!lead,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["lead-detail", lead?.id] });
  const refreshTasks = () => invalidatePendingQueries(qc, lead?.id);

  // Mover o lead: primeiro o pipeline, depois a etapa daquele pipeline.
  const allStagesQ = useQuery({
    queryKey: ["all-stages", activeOrganizationId ?? "none"],
    queryFn: () =>
      allStagesFn({ data: activeOrganizationId ? { organizationId: activeOrganizationId } : {} }),
    enabled: !!lead,
    staleTime: 60_000,
  });
  const allStages = allStagesQ.data ?? [];
  const pipelineOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of allStages) if (s.pipeline_id && !seen.has(s.pipeline_id)) seen.set(s.pipeline_id, s.pipeline_name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [allStages]);
  const [stageNow, setStageNow] = useState<string | null>(null);
  const currentStageId = stageNow ?? lead?.stage_id ?? null;
  const currentPipelineId =
    allStages.find((s) => s.id === currentStageId)?.pipeline_id ??
    stages.find((s) => s.id === currentStageId)?.pipeline_id ??
    null;
  const [pickedPipeline, setPickedPipeline] = useState<string | null>(null);
  useEffect(() => {
    setStageNow(null);
    setPickedPipeline(null);
  }, [lead?.id]);
  const shownPipeline = pickedPipeline ?? currentPipelineId;
  const stagesOfPipeline = allStages.length
    ? allStages.filter((s) => s.pipeline_id === shownPipeline)
    : stages;

  const move = useMutation({
    mutationFn: (stageId: string) => moveFn({ data: { id: lead!.id, stage_id: stageId } }),
    onSuccess: (_r, stageId) => {
      setStageNow(stageId);
      setPickedPipeline(null);
      const target = allStages.find((s) => s.id === stageId);
      if (target && target.pipeline_id !== currentPipelineId) {
        toast.success(`Lead movido para ${target.pipeline_name} · ${target.name}`);
      }
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addTask = useMutation({
    mutationFn: () =>
      taskFn({
        data: {
          leadId: lead!.id,
          title: taskTitle.trim(),
          kind: taskKind as "tarefa",
          due_at: taskDue ? new Date(taskDue).toISOString() : null,
          duration_minutes: Number(taskDuration),
          invite_lead: inviteLead,
          priority: taskPriority,
        },
      }),
    onSuccess: (res: any) => {
      setTaskTitle(""); setTaskDue(""); setTaskPriority("media");
      if (res?.priorityPending) toast.warning("Agendado, mas a prioridade só é salva depois de rodar a migração 21 no banco.");
      if (taskDue) {
        if (res?.syncError) toast.error(`Salvo, mas o Google Agenda falhou: ${res.syncError}`);
        else if (res?.synced) toast.success("Agendado e sincronizado com o Google Agenda.");
      }
      refreshTasks();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao agendar"),
  });


  const addNote = useMutation({
    mutationFn: () => noteFn({ data: { leadId: lead!.id, body: noteText.trim() } }),
    onSuccess: () => { noteDraft.reset(""); refresh(); },
    // o texto continua no campo (e guardado no aparelho) para tentar de novo
    onError: (e: Error) => toast.error(`Anotação não salva: ${e.message}. O texto continua guardado.`),
  });

  const toggleTask = useMutation({
    mutationFn: (v: { id: string; done: boolean }) => toggleFn({ data: v }),
    onSuccess: refreshTasks,
    onError: (error: Error) => toast.error(error.message),
  });
  const removeTask = useMutation({
    mutationFn: (id: string) => delTaskFn({ data: { id } }),
    onSuccess: refreshTasks,
    onError: (error: Error) => toast.error(error.message),
  });
  const removeFileFn = useServerFn(removeLeadFile);
  const removeFile = useMutation({
    mutationFn: (id: string) => removeFileFn({ data: { id } }),
    onSuccess: () => { toast.success("Arquivo removido."); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Envio pelo servidor (nome com acento/ç funciona, erro aparece na tela, toda a equipe baixa).
  const uploadFileFn = useServerFn(uploadLeadFile);
  const fileUrlFn = useServerFn(leadFileUrl);
  const sendOne = async (leadId: string, file: File) => {
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("file", file);
    await uploadFileFn({ data: fd });
  };

  async function onUpload(list: FileList | File[]) {
    if (!lead) return;
    const picked = Array.from(list);
    if (!picked.length) return;
    setUploading(true);
    let ok = 0;
    let waiting = 0;
    try {
      for (const file of picked) {
        if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
          toast.error(`${file.name}: o arquivo deve ter no máximo ${MAX_ATTACHMENT_MB} MB.`);
          continue;
        }
        try {
          await sendOne(lead.id, file);
          ok++;
        } catch (e: any) {
          // sem conexão: guarda no aparelho e envia quando a internet voltar
          if (isNetworkError(e) && (await enqueueLeadFile(lead.id, file))) waiting++;
          else toast.error(`${file.name}: ${e?.message ?? "não foi possível anexar."}`);
        }
      }
      if (ok) toast.success(ok === 1 ? "Arquivo anexado." : `${ok} arquivos anexados.`);
      if (waiting) toast.warning(`${waiting} arquivo(s) guardado(s) neste aparelho: serão enviados quando a conexão voltar.`);
      refresh();
      setQueued(await queuedLeadFiles(lead.id));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  // Envia o que ficou na fila (ao abrir o card e quando a internet volta).
  const flushing = useRef(false);
  const flushQueue = async (leadId: string) => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const items = await queuedLeadFiles(leadId);
      let sent = 0;
      for (const it of items) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) break;
        try {
          await sendOne(leadId, new File([it.blob], it.name, { type: it.type }));
          await dropQueuedFile(it.id);
          sent++;
        } catch (e) {
          if (isNetworkError(e)) break;
          await dropQueuedFile(it.id); // recusado pelo servidor: não fica tentando para sempre
          toast.error(`${it.name}: ${(e as Error)?.message ?? "não foi possível anexar."}`);
        }
      }
      if (sent) {
        toast.success(sent === 1 ? "Arquivo pendente enviado." : `${sent} arquivos pendentes enviados.`);
        refresh();
      }
      setQueued(await queuedLeadFiles(leadId));
    } finally {
      flushing.current = false;
    }
  };
  useEffect(() => {
    if (!lead?.id) return;
    const id = lead.id;
    void flushQueue(id);
    const onOnline = () => void flushQueue(id);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  async function download(id: string) {
    try {
      const { url } = await fileUrlFn({ data: { id } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível abrir o arquivo.");
    }
  }

  const utms = lead
    ? ([
        ["utm_source", lead.utm_source],
        ["utm_medium", lead.utm_medium],
        ["utm_campaign", lead.utm_campaign],
        ["utm_term", lead.utm_term],
        ["utm_content", lead.utm_content],
        ["gclid", lead.gclid],
        ["fbclid", lead.fbclid],
      ] as const).filter(([, v]) => !!v)
    : [];

  // Pendentes primeiro (pelo horário), concluídas por último.
  const tasks = [...(data?.tasks ?? [])].sort((a: any, b: any) =>
    Number(a.done) - Number(b.done) || String(a.due_at ?? "9999").localeCompare(String(b.due_at ?? "9999")));
  const files = data?.files ?? [];

  const nextTask = tasks
    .filter((t) => !t.done && t.due_at)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())[0];

  const events = data?.events ?? [];
  const visibleEvents = showAllEvents ? events : events.slice(0, 3);
  const leadScore = lead?.lead_score != null ? Number(lead.lead_score) : null;
  const { data: answerLabels } = useLeadAnswerLabels(((lead as any)?.organization_id as string | undefined) ?? null);
  const responses = buildLeadAnswers(lead?.metadata, answerLabels ?? []);
  const origins = leadOrigins(lead?.metadata, lead?.source);
  const missing = lead
    ? ([
        ["Telefone", lead.phone],
        ["E-mail", lead.email],
        ["Cidade", lead.city],
        ["Estado", lead.state],
        ["Qualificação", lead.lead_classification],
      ] as const).filter(([, v]) => !v || !String(v).trim()).map(([k]) => k)
    : [];

  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
      >
        {lead && (
          <>
            <header className="lead-gradient-card relative flex flex-wrap items-center gap-2 border-b border-white/10 py-3 pl-4 pr-14 md:pl-6 md:pr-16">
              {/* Fechar fica sempre no canto, mesmo com muitos botões ou tela estreita */}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Fechar o card"
                title="Fechar (Esc)"
                className="absolute right-2 top-2 z-10 h-9 w-9 text-white hover:bg-white/10 hover:text-white md:right-4 md:top-3"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-5 w-5 stroke-[3]" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <DialogTitle className="truncate text-xl text-white">{lead.name}</DialogTitle>
                  <LeadQualificationBadge
                    classification={lead.lead_classification}
                    score={leadScore}
                    className="h-6 px-2.5 text-[11px] shadow-sm ring-1 ring-white/40 bg-white"
                  />
                  <DuplicateBadge lead={lead as never} />
                  {(
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Adicionar tag"
                          className="h-7 w-7 shrink-0 text-white hover:bg-white/10 hover:text-white"
                        >
                          <Tag className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel className="text-xs">Tags</DropdownMenuLabel>
                        {tags.map((t) => (
                          <DropdownMenuCheckboxItem
                            key={t.slug}
                            checked={hasTag(t.slug)}
                            onSelect={(e) => e.preventDefault()}
                            onCheckedChange={() => toggleTag(t.slug)}
                          >
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                              {t.name}
                            </span>
                          </DropdownMenuCheckboxItem>
                        ))}
                        {tags.length === 0 && (
                          <>
                            <DropdownMenuItem disabled>Nenhuma tag configurada</DropdownMenuItem>
                            {onConfigureTags && (
                              <DropdownMenuItem
                                onSelect={() => {
                                  onOpenChange(false);
                                  onConfigureTags();
                                }}
                              >
                                Configurar tags…
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {shownTags.map((t) => (
                    <Badge
                      key={t.slug}
                      className="border-0 text-white"
                      style={{ backgroundColor: t.color }}
                    >
                      {t.name}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-white/70">
                  Criado em {fmt(lead.created_at)}
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {lead.value != null && (
                  <Badge className="border-white/20 bg-white/10 font-semibold text-white hover:bg-white/20">
                    {currency(Number(lead.value))}
                  </Badge>
                )}
                {pipelineOptions.length > 0 && (
                  <Select
                    value={shownPipeline ?? ""}
                    onValueChange={(v) => setPickedPipeline(v === currentPipelineId ? null : v)}
                  >
                    <SelectTrigger
                      className="h-8 min-w-[8.5rem] flex-1 border-white/20 text-white sm:w-[170px] sm:flex-none"
                      aria-label="Pipeline do lead"
                      title="Pipeline"
                    >
                      <SelectValue placeholder="Pipeline" />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelineOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select
                  value={stagesOfPipeline.some((s) => s.id === currentStageId) ? currentStageId ?? "" : ""}
                  onValueChange={(v) => move.mutate(v)}
                  disabled={move.isPending}
                >
                  <SelectTrigger
                    className="h-8 min-w-[8.5rem] flex-1 border-white/20 text-white sm:w-[190px] sm:flex-none"
                    aria-label="Etapa do lead"
                    title="Etapa"
                  >
                    <SelectValue placeholder="Escolha a etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {stagesOfPipeline.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="outline"
                  title="Enviar e-mail"
                  className="h-8 w-8 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => setEmailOpen(true)}
                >
                  <Mail className="h-4 w-4" />
                </Button>
                <Button
                  asChild
                  size="icon"
                  variant="outline"
                  title="Abrir este lead em outra aba"
                  className="h-8 w-8 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  <a href={leadCardHref(lead.id)} target="_blank" rel="noopener" aria-label="Abrir este lead em outra aba">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  title="Editar lead"
                  className="h-8 w-8 bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                  onClick={() => onEdit(lead)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </header>

            {nextTask && (
              <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground md:px-6">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-foreground">Próximo agendamento:</span>
                <span>{fmt(nextTask.due_at!)}</span>
                <span className="truncate">· {nextTask.title}</span>
              </div>
            )}

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
              {/* Coluna principal: dados + jornada + anotações */}
              <div className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
                  {missing.length > 0 && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        <strong>Cadastro incompleto:</strong> falta {missing.join(", ")}.
                        {" "}Complete em <button type="button" className="font-semibold underline" onClick={() => onEdit(lead)}>Editar lead</button>.
                      </span>
                    </div>
                  )}

                  <div className="lead-gradient-card rounded-xl border p-3 text-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Dados de cadastro</p>
                    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                      <div className="flex items-start gap-2">
                        <dt className="sr-only">Nome</dt>
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                        <dd className="min-w-0 break-words">
                          <span className="block text-[11px] text-white/60">Nome / empresa</span>
                          {lead.name}{lead.company ? ` · ${lead.company}` : ""}
                        </dd>
                      </div>
                      <div className="flex items-start gap-2">
                        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                        <dd className="min-w-0">
                          <span className="block text-[11px] text-white/60">Telefone / WhatsApp</span>
                          {lead.phone ? (
                            <span className="inline-flex items-center gap-1">
                              <a href={`tel:${lead.phone}`} className="underline underline-offset-2 hover:text-white/90">{lead.phone}</a>
                              <a
                                href={`https://wa.me/${lead.phone.replace(/\D/g, "").replace(/^(?!55)(\d{10,11})$/, "55$1")}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Abrir WhatsApp"
                                className="ml-1 inline-flex items-center rounded-full bg-[#25D366] p-1 text-white hover:opacity-90"
                              >
                                <WhatsAppIcon className="h-3 w-3" />
                              </a>
                            </span>
                          ) : (
                            <span className="italic text-white/50">Não informado</span>
                          )}
                        </dd>
                      </div>
                      <div className="flex items-start gap-2">
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                        <dd className="min-w-0 break-all">
                          <span className="block text-[11px] text-white/60">E-mail</span>
                          {lead.email ? (
                            <a href={`mailto:${lead.email}`} className="underline underline-offset-2 hover:text-white/90">{lead.email}</a>
                          ) : (
                            <span className="italic text-white/50">Não informado</span>
                          )}
                        </dd>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                        <dd className="min-w-0">
                          <span className="block text-[11px] text-white/60">Cidade / Estado</span>
                          {lead.city || lead.state ? (
                            [lead.city, lead.state].filter(Boolean).join(" — ")
                          ) : (
                            <span className="italic text-white/50">Não informado</span>
                          )}
                        </dd>
                      </div>
                      <div className="flex items-start gap-2">
                        <Tag className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                        <dd className="min-w-0 break-words">
                          <span className="block text-[11px] text-white/60">Origem</span>
                          {origins.length ? origins.join(" · ") : <span className="italic text-white/50">Não informado</span>}
                        </dd>
                      </div>
                      <div className="flex items-start gap-2">
                        <Activity className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                        <dd className="min-w-0">
                          <span className="block text-[11px] text-white/60">Qualificação do formulário</span>
                          <LeadQualificationBadge
                            classification={lead.lead_classification}
                            score={leadScore}
                            className="bg-white"
                          />
                        </dd>
                      </div>
                      {(lead.utm_campaign || lead.utm_content) && (
                        <div className="flex items-start gap-2 sm:col-span-2">
                          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                          <dd className="min-w-0 break-words">
                            <span className="block text-[11px] text-white/60">Campanha / anúncio</span>
                            {[lead.utm_campaign, lead.utm_term, lead.utm_content].filter(Boolean).join(" › ")}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <div className="mt-4 rounded-lg border bg-card px-4 py-3">
                    <p className="text-sm font-semibold">Respostas do formulário</p>
                    {responses.length > 0 ? (
                      <dl className="mt-2 divide-y">
                        {responses.map((response, index) => (
                          <div key={`${response.key}-${index}`} className="grid gap-1 py-2 text-sm sm:grid-cols-[minmax(0,220px)_1fr]">
                            <dt className="font-medium text-muted-foreground">{response.label}</dt>
                            <dd className="whitespace-pre-wrap break-words">{response.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Este lead não trouxe respostas de formulário.</p>
                    )}
                  </div>

                  <p className="mb-3 mt-5 flex items-center gap-2 text-sm font-semibold">
                    <Activity className="h-4 w-4 text-primary" /> Histórico da jornada
                  </p>
                  <ol className="relative space-y-4 border-l pl-5">
                    {visibleEvents.map((ev) => {
                      const Icon = EVENT_ICON[ev.kind] ?? Activity;
                      const note = findNoteFromEvent(ev, data?.notes ?? []);
                      return (
                        <li key={ev.id} className="relative">
                          <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Icon className="h-3 w-3" />
                          </span>
                          <p className="text-sm font-medium">{ev.title}</p>
                          {ev.description && <p className="text-xs text-muted-foreground">{ev.description}</p>}
                          <p className="text-[11px] text-muted-foreground">{fmt(ev.created_at)}</p>
                          {note && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 h-7 text-xs"
                              onClick={() => setSelectedNote(note)}
                            >
                              <MessageSquare className="mr-1.5 h-3 w-3" /> Ver nota
                            </Button>
                          )}
                        </li>
                      );
                    })}
                    {events.length === 0 && (
                      <li className="text-sm text-muted-foreground">Sem eventos ainda.</li>
                    )}
                  </ol>
                  {events.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAllEvents((v) => !v)}
                      className="mt-3 text-xs font-medium text-primary hover:underline"
                    >
                      {showAllEvents ? "Ver histórico resumido" : "Ver histórico completo"}
                    </button>
                  )}

                  {/* Anotações */}
                  <div className="mt-6 rounded-xl border bg-muted/40 px-4 py-3">
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <MessageSquare className="h-4 w-4 text-primary" /> Anotações
                    </p>
                    <div className="flex items-start gap-2">
                      <Textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Registre conversas, detalhes ou próximos passos..."
                        className="min-h-[72px] flex-1 resize-none bg-white text-foreground"
                      />
                      <Button
                        className="h-10"
                        disabled={!noteText.trim() || addNote.isPending}
                        onClick={() => addNote.mutate()}
                      >
                        <Plus className="mr-1.5 h-4 w-4" /> Adicionar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Coluna direita: agendamentos / arquivos / UTM */}
              <aside className="min-h-0 border-t lg:border-l lg:border-t-0">
                <div className="min-h-0 h-full overflow-y-auto px-4 py-4">
                  <Tabs value={sideTab} onValueChange={setSideTab}>
                    <TabsList className="lead-gradient-card grid w-full grid-cols-3">
                      <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
                      <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
                      <TabsTrigger value="utm">UTM</TabsTrigger>
                    </TabsList>


                    <TabsContent value="tarefas" className="mt-4 space-y-3">
                      <Button className="w-full" onClick={() => setNewTaskOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" /> Nova tarefa para este lead
                      </Button>
                      <TaskCreateDialog
                        open={newTaskOpen}
                        onOpenChange={setNewTaskOpen}
                        lockLead
                        defaults={{ lead: { id: lead.id, name: lead.name, email: lead.email ?? null } }}
                        onCreated={() => refreshTasks()}
                      />

                      <div className="space-y-2">
                        {tasks.map((t) => (
                          <div key={t.id} className={`rounded-lg border p-3 ${t.done ? "bg-muted/30" : "bg-card"}`}>
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={t.done}
                              onCheckedChange={(v) => toggleTask.mutate({ id: t.id, done: !!v })}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <p className={t.done ? "text-sm line-through text-muted-foreground" : "text-sm font-medium"}>
                                {t.title}
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                                  {TASK_KINDS.find((k) => k.value === t.kind)?.label ?? t.kind}
                                </Badge>
                                {(t as any).priority && (t as any).priority !== "media" && (
                                  <Badge variant="outline" className={`h-4 px-1.5 text-[10px] ${PRIORITY_TONE[(t as any).priority as Priority]}`}>
                                    {PRIORITY_LABEL[(t as any).priority as Priority]}
                                  </Badge>
                                )}
                                {t.due_at && <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />{fmt(t.due_at)}</span>}
                                {(t as any).duration_minutes && <span>{(t as any).duration_minutes} min</span>}
                                {(t as any).gcal_event_id && (
                                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Google Agenda</Badge>
                                )}
                                {(t as any).meet_link && (
                                  <a
                                    href={(t as any).meet_link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary underline"
                                  >
                                    Entrar no Meet
                                  </a>
                                )}
                              </p>
                            </div>

                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTask.mutate(t.id)} aria-label="Excluir agendamento">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                          <LeadTaskNotes notes={(t as any).notes ?? null} className="mt-2" />
                          <LeadTaskActions task={t as any} leadEmail={lead.email ?? null} />
                          </div>
                        ))}
                        {tasks.length === 0 && (
                          <p className="text-sm text-muted-foreground">Nenhum agendamento para este lead.</p>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="arquivos" className="mt-4 space-y-3">
                      <input
                        ref={fileInput}
                        type="file"
                        multiple
                        accept={ACCEPT_ATTACHMENTS}
                        className="hidden"
                        onChange={(e) => e.target.files?.length && onUpload(e.target.files)}
                      />
                      <Button variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
                        <FileUp className="mr-1.5 h-4 w-4" />
                        {uploading ? "Enviando..." : "Anexar arquivo"}
                      </Button>
                      <p className="text-[11px] text-muted-foreground">PDF, imagem (PNG/JPG/WebP), Excel, Word ou CSV · até {MAX_ATTACHMENT_MB} MB.</p>
                      <div className="space-y-2">
                        {queued.map((q) => (
                          <div key={q.id} className="flex items-center gap-3 rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 dark:bg-amber-500/10">
                            <Paperclip className="h-4 w-4 text-amber-700" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{q.name}</p>
                              <p className="text-[11px] text-amber-800 dark:text-amber-200">Aguardando conexão para enviar · guardado neste aparelho</p>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => lead && flushQueue(lead.id)}>Tentar agora</Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Descartar ${q.name}`} onClick={async () => { await dropQueuedFile(q.id); if (lead) setQueued(await queuedLeadFiles(lead.id)); }}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        {files.map((f) => (
                          <div key={f.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{f.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {bytes(f.size_bytes)} · {fmt(f.created_at)}
                              </p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Baixar ${f.name}`} onClick={() => download(f.id)}>
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remover ${f.name}`} disabled={removeFile.isPending} onClick={() => { if (confirm(`Remover "${f.name}"?`)) removeFile.mutate(f.id); }}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        {files.length === 0 && queued.length === 0 && (
                          <p className="text-sm text-muted-foreground">Nenhum arquivo anexado.</p>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="utm" className="mt-4 space-y-2">
                      {utms.length === 0 && <p className="text-sm text-muted-foreground">Sem dados de campanha.</p>}
                      {utms.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                          <span className="font-mono text-xs text-muted-foreground">{k}</span>
                          <span className="max-w-[60%] truncate font-medium">{v}</span>
                        </div>
                      ))}
                      {lead.landing_url && (
                        <div className="rounded-lg border px-3 py-2 text-xs">
                          <p className="text-muted-foreground">landing_url</p>
                          <p className="break-all">{lead.landing_url}</p>
                        </div>
                      )}
                      {lead.referrer && (
                        <div className="rounded-lg border px-3 py-2 text-xs">
                          <p className="text-muted-foreground">referrer</p>
                          <p className="break-all">{lead.referrer}</p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </aside>
            </div>


            <Dialog open={!!selectedNote} onOpenChange={(v) => !v && setSelectedNote(null)}>
              <DialogContent className="max-w-md">
                <DialogTitle>Nota</DialogTitle>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{selectedNote ? fmt(selectedNote.created_at) : ""}</p>
                  <p className="whitespace-pre-wrap text-sm">{selectedNote?.body}</p>
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setSelectedNote(null)}>Fechar</Button>
                </div>
              </DialogContent>
            </Dialog>

            <SendLeadEmailDialog
              open={emailOpen}
              onOpenChange={setEmailOpen}
              leadId={lead.id}
              leadName={lead.name}
              defaultTo={lead.email}
              onSent={() => qc.invalidateQueries({ queryKey: ["lead-detail", lead.id] })}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
