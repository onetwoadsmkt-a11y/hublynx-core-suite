import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, ArrowRightLeft, Building2, CalendarClock, CheckCircle2, Download, FileUp,
  Mail, MapPin, MessageSquare, Paperclip, Phone, Plus, Tag, Trash2, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  addLeadNote, deleteLeadFile, deleteLeadTask, getLeadDetail, moveLead, registerLeadFile,
  toggleLeadTask, upsertLeadTask,
} from "@/lib/pipeline/pipeline.functions";
import { currency } from "./LeadCard";
import type { Lead, PipelineStage } from "./types";

const EVENT_ICON: Record<string, typeof Activity> = {
  created: Plus,
  stage_changed: ArrowRightLeft,
  note_added: MessageSquare,
  task_created: CalendarClock,
  task_done: CheckCircle2,
  file_added: Paperclip,
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

export function LeadDrawer({
  lead,
  stages,
  onOpenChange,
  onEdit,
}: {
  lead: Lead | null;
  stages: PipelineStage[];
  onOpenChange: (v: boolean) => void;
  onEdit: (lead: Lead) => void;
}) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getLeadDetail);
  const noteFn = useServerFn(addLeadNote);
  const moveFn = useServerFn(moveLead);
  const taskFn = useServerFn(upsertLeadTask);
  const toggleFn = useServerFn(toggleLeadTask);
  const delTaskFn = useServerFn(deleteLeadTask);
  const fileFn = useServerFn(registerLeadFile);
  const delFileFn = useServerFn(deleteLeadFile);

  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskKind, setTaskKind] = useState<string>("tarefa");
  const [taskDue, setTaskDue] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["lead-detail", lead?.id],
    queryFn: () => detailFn({ data: { leadId: lead!.id } }),
    enabled: !!lead,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["lead-detail", lead?.id] });

  const addNote = useMutation({
    mutationFn: () => noteFn({ data: { leadId: lead!.id, body: note.trim() } }),
    onSuccess: () => { setNote(""); refresh(); },
  });

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
        },
      }),
    onSuccess: () => { setTaskTitle(""); setTaskDue(""); refresh(); },
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

  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
      >
        {lead && (
          <>
            <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-6">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-xl">{lead.name}</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Criado em {fmt(lead.created_at)}
                </p>
              </div>
              {lead.value != null && (
                <Badge className="font-semibold">{currency(Number(lead.value))}</Badge>
              )}
              <Select value={lead.stage_id ?? ""} onValueChange={(v) => move.mutate(v)}>
                <SelectTrigger className="h-8 w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => onEdit(lead)}>Editar</Button>
              <Button size="icon" variant="ghost" className="hidden" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
              {/* Coluna principal */}
              <div className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
                  <div className="grid gap-2 rounded-xl border bg-muted/30 p-3 text-sm sm:grid-cols-2">
                    {lead.company && <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{lead.company}</p>}
                    {lead.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{lead.phone}</p>}
                    {lead.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{lead.email}</p>}
                    {(lead.city || lead.state) && (
                      <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{[lead.city, lead.state].filter(Boolean).join(" — ")}</p>
                    )}
                    {lead.source && <p className="flex items-center gap-2"><Tag className="h-4 w-4 text-muted-foreground" />{lead.source}</p>}
                  </div>

                  <Tabs defaultValue="tarefas" className="mt-4">
                    <TabsList className="grid w-full grid-cols-3">
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
                        <Button
                          disabled={!taskTitle.trim() || addTask.isPending}
                          onClick={() => addTask.mutate()}
                        >
                          <Plus className="mr-1.5 h-4 w-4" /> Agendar
                        </Button>
                      </div>

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
                              <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                                  {TASK_KINDS.find((k) => k.value === t.kind)?.label ?? t.kind}
                                </Badge>
                                {t.due_at && <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />{fmt(t.due_at)}</span>}
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

                {/* Rodapé: notas */}
                <div className="border-t bg-muted/20 px-4 py-3 md:px-6">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" /> Notas
                  </p>
                  <div className="flex flex-col gap-2 lg:flex-row">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="Registre o resumo da conversa com o lead..."
                      className="flex-1"
                    />
                    <Button
                      className="lg:self-end"
                      disabled={!note.trim() || addNote.isPending}
                      onClick={() => addNote.mutate()}
                    >
                      Adicionar nota
                    </Button>
                  </div>
                  <div className="mt-3 flex max-h-32 gap-2 overflow-x-auto overflow-y-auto pb-1">
                    {(data?.notes ?? []).map((n) => (
                      <div key={n.id} className="min-w-[240px] max-w-[320px] shrink-0 rounded-lg border bg-card p-2.5">
                        <p className="whitespace-pre-wrap text-xs">{n.body}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{fmt(n.created_at)}</p>
                      </div>
                    ))}
                    {(data?.notes ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhuma nota registrada.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Coluna direita: jornada */}
              <aside className="min-h-0 border-t lg:border-l lg:border-t-0">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="border-b px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Activity className="h-4 w-4 text-primary" /> Histórico da jornada
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <ol className="relative space-y-4 border-l pl-5">
                      {(data?.events ?? []).map((ev) => {
                        const Icon = EVENT_ICON[ev.kind] ?? Activity;
                        return (
                          <li key={ev.id} className="relative">
                            <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Icon className="h-3 w-3" />
                            </span>
                            <p className="text-sm font-medium">{ev.title}</p>
                            {ev.description && <p className="text-xs text-muted-foreground">{ev.description}</p>}
                            <p className="text-[11px] text-muted-foreground">{fmt(ev.created_at)}</p>
                          </li>
                        );
                      })}
                      {(data?.events ?? []).length === 0 && (
                        <li className="text-sm text-muted-foreground">Sem eventos ainda.</li>
                      )}
                    </ol>
                  </div>
                  <Separator />
                </div>
              </aside>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
