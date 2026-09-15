import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, ArrowRightLeft, Building2, CalendarClock, CalendarDays, CheckCircle2, Download, FileUp,
  Mail, MapPin, MessageSquare, Paperclip, Pencil, Phone, Plus, Tag, Trash2, X,
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
  addLeadNote, deleteLeadFile, deleteLeadTask, getLeadDetail, moveLead, registerLeadFile,
  toggleLeadTask, upsertLeadTask,
} from "@/lib/pipeline/pipeline.functions";
import { setLeadTags } from "@/lib/pipeline/tags.functions";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { currency } from "./LeadCard";
import { SendLeadEmailDialog } from "./SendLeadEmailDialog";
import type { Lead, LeadEvent, LeadNote, PipelineStage } from "./types";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function TemperatureBadge({ value }: { value: Lead["temperature"] }) {
  const config = {
    quente: { label: "Quente", className: "bg-red-500/90 text-white hover:bg-red-500/90" },
    morno: { label: "Morno", className: "bg-amber-500/90 text-white hover:bg-amber-500/90" },
    frio: { label: "Frio", className: "bg-sky-500/90 text-white hover:bg-sky-500/90" },
  };
  const cfg = config[(value as keyof typeof config) ?? "morno"];
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

const EVENT_ICON: Record<string, typeof Activity> = {
  created: Plus,
  stage_changed: ArrowRightLeft,
  note: MessageSquare,
  note_added: MessageSquare,
  task_created: CalendarClock,
  task_done: CheckCircle2,
  file_added: Paperclip,
  email_sent: Mail,
  tag_added: Tag,
  tag_removed: Tag,
};

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
  const taskFn = useServerFn(upsertLeadTask);
  const toggleFn = useServerFn(toggleLeadTask);
  const delTaskFn = useServerFn(deleteLeadTask);
  const fileFn = useServerFn(registerLeadFile);
  const delFileFn = useServerFn(deleteLeadFile);

  const noteFn = useServerFn(addLeadNote);

  const [emailOpen, setEmailOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<LeadNote | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskKind, setTaskKind] = useState<string>("tarefa");
  const [taskDue, setTaskDue] = useState("");
  const [taskDuration, setTaskDuration] = useState("30");
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

  const move = useMutation({
    mutationFn: (stageId: string) => moveFn({ data: { id: lead!.id, stage_id: stageId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipeline"] }); refresh(); },
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
        },
      }),
    onSuccess: (res: any) => {
      setTaskTitle(""); setTaskDue("");
      if (taskDue) {
        if (res?.syncError) toast.error(`Salvo, mas o Google Agenda falhou: ${res.syncError}`);
        else if (res?.synced) toast.success("Agendado e sincronizado com o Google Agenda.");
      }
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao agendar"),
  });


  const addNote = useMutation({
    mutationFn: () => noteFn({ data: { leadId: lead!.id, body: noteText.trim() } }),
    onSuccess: () => { setNoteText(""); refresh(); },
  });

  const toggleTask = useMutation({
    mutationFn: (v: { id: string; done: boolean }) => toggleFn({ data: v }),
    onSuccess: refresh,
  });
  const removeTask = useMutation({
    mutationFn: (id: string) => delTaskFn({ data: { id } }),
    onSuccess: refresh,
  });
  const removeFile = useMutation({
    mutationFn: (id: string) => delFileFn({ data: { id } }),
    onSuccess: refresh,
  });

  async function onUpload(file: File) {
    if (!lead) return;
    setUploading(true);
    try {
      const path = `${lead.id}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("lead-files").upload(path, file);
      if (error) throw error;
      await fileFn({
        data: {
          leadId: lead.id,
          name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
        },
      });
      refresh();
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function download(path: string, name: string) {
    const { data: signed } = await supabase.storage
      .from("lead-files")
      .createSignedUrl(path, 300, { download: name });
    if (signed?.signedUrl) window.open(signed.signedUrl, "_blank");
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

  const tasks = data?.tasks ?? [];
  const files = data?.files ?? [];

  const nextTask = tasks
    .filter((t) => !t.done && t.due_at)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())[0];

  const events = data?.events ?? [];
  const visibleEvents = showAllEvents ? events : events.slice(0, 3);

  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
      >
        {lead && (
          <>
            <header className="lead-gradient-card flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3 md:px-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <DialogTitle className="truncate text-xl text-white">{lead.name}</DialogTitle>
                  <TemperatureBadge value={lead.temperature} />
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
              <div className="flex items-center gap-2">
                {lead.value != null && (
                  <Badge className="border-white/20 bg-white/10 font-semibold text-white hover:bg-white/20">
                    {currency(Number(lead.value))}
                  </Badge>
                )}
                <Select value={lead.stage_id ?? ""} onValueChange={(v) => move.mutate(v)}>
                  <SelectTrigger className="h-8 w-[190px] border-white/20 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
                  size="icon"
                  title="Editar lead"
                  className="h-8 w-8 bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                  onClick={() => onEdit(lead)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => onOpenChange(false)}>
                  <X className="h-5 w-5 stroke-[3]" />
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
                  <div className="lead-gradient-card grid gap-2 rounded-xl border p-3 text-sm sm:grid-cols-2">
                    {lead.company && <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-white/80" />{lead.company}</p>}
                    {lead.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-white/80" />
                        <a href={`tel:${lead.phone}`} className="underline underline-offset-2 hover:text-white/90">{lead.phone}</a>
                        <a
                          href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir WhatsApp"
                          className="ml-1 inline-flex items-center rounded-full bg-[#25D366] p-1 text-white hover:opacity-90"
                        >
                          <WhatsAppIcon className="h-3 w-3" />
                        </a>
                      </p>
                    )}
                    {lead.email && (
                      <p className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-white/80" />
                        <a href={`mailto:${lead.email}`} className="underline underline-offset-2 hover:text-white/90">{lead.email}</a>
                      </p>
                    )}
                    {(lead.city || lead.state) && (
                      <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-white/80" />{[lead.city, lead.state].filter(Boolean).join(" — ")}</p>
                    )}
                    {lead.source && <p className="flex items-center gap-2"><Tag className="h-4 w-4 text-white/80" />{lead.source}</p>}
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
                  <Tabs defaultValue="tarefas">
                    <TabsList className="lead-gradient-card grid w-full grid-cols-3">
                      <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
                      <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
                      <TabsTrigger value="utm">UTM</TabsTrigger>
                    </TabsList>


                    <TabsContent value="tarefas" className="mt-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Input
                          value={taskTitle}
                          onChange={(e) => setTaskTitle(e.target.value)}
                          placeholder="Ex.: Reunião de apresentação"
                          className="min-w-[200px] flex-1"
                        />
                        <Select value={taskKind} onValueChange={setTaskKind}>
                          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TASK_KINDS.map((k) => (
                              <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="datetime-local"
                          value={taskDue}
                          onChange={(e) => setTaskDue(e.target.value)}
                          className="w-[210px]"
                        />
                        <Select value={taskDuration} onValueChange={setTaskDuration}>
                          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["15", "30", "45", "60", "90", "120"].map((m) => (
                              <SelectItem key={m} value={m}>{m} min</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          disabled={!taskTitle.trim() || addTask.isPending}
                          onClick={() => addTask.mutate()}
                        >
                          <Plus className="mr-1.5 h-4 w-4" />
                          {addTask.isPending ? "Agendando..." : "Agendar"}
                        </Button>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox checked={inviteLead} onCheckedChange={(v) => setInviteLead(!!v)} />
                        Convidar o lead por e-mail{lead.email ? ` (${lead.email})` : " (sem e-mail cadastrado)"} · sincroniza no Google Agenda
                      </label>

                      <div className="space-y-2">
                        {tasks.map((t) => (
                          <div key={t.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
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

                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTask.mutate(t.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
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
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                      />
                      <Button variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
                        <FileUp className="mr-1.5 h-4 w-4" />
                        {uploading ? "Enviando..." : "Anexar arquivo"}
                      </Button>
                      <div className="space-y-2">
                        {files.map((f) => (
                          <div key={f.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{f.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {bytes(f.size_bytes)} · {fmt(f.created_at)}
                              </p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => download(f.storage_path, f.name)}>
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFile.mutate(f.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        {files.length === 0 && (
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
