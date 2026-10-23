import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import {
  ArrowRight, CheckCircle2, Clock, Copy, FileCode, Mail, Pencil, Plus, Send, Tag, Trash2, XCircle, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  deleteAutomation, deleteEmailTemplate, listAutomations, listEmailTemplates, saveAutomation,
  saveEmailTemplate, sendTestEmailTemplate, toggleAutomation,
} from "@/lib/automations/automations.functions";
import {
  describeTrigger, htmlToText, isHtmlBody, renderTemplate, sanitizeEmailHtml, TEMPLATE_VARS,
  type AutomationAction, type AutomationCondition, type AutomationTrigger, type LeadFacts,
} from "@/lib/automations/rules";

/** Dados de exemplo para pré-visualizar e testar modelos. */
const SAMPLE_LEAD: LeadFacts = {
  id: "exemplo", name: "Maria Souza", company: "Empresa Exemplo", email: "maria@exemplo.com", phone: "(12) 99999-0000",
  city: "Taubaté", state: "SP", value: 5000, openTasks: 0, overdueTasks: 0,
};
const SAMPLE_EXTRA = { etapa: "Proposta", pipeline: "Pipeline principal", responsavel: "Você" };
import type { PipelineStage } from "./types";
import { cn } from "@/lib/utils";

type TagOpt = { slug: string; name: string; color: string };
type Tab = "automacoes" | "emails" | "execucoes";

const TEMPS = [{ v: "quente", l: "Quente" }, { v: "morno", l: "Morno" }, { v: "frio", l: "Frio" }] as const;
const KINDS = [{ v: "follow_up", l: "Follow-up" }, { v: "reuniao", l: "Reunião" }, { v: "call", l: "Ligação" }, { v: "tarefa", l: "Tarefa" }] as const;
const PRIOS = [{ v: "baixa", l: "Baixa" }, { v: "media", l: "Média" }, { v: "alta", l: "Alta" }, { v: "critica", l: "Urgente" }] as const;

const CONDITION_OPTS: { v: AutomationCondition["field"]; l: string }[] = [
  { v: "tags_any", l: "Tem a tag" },
  { v: "tags_none", l: "Não tem a tag" },
  { v: "temperature", l: "Temperatura é" },
  { v: "value_gte", l: "Valor maior ou igual a" },
  { v: "value_lte", l: "Valor menor ou igual a" },
  { v: "no_open_tasks", l: "Não tem tarefa em aberto" },
  { v: "has_overdue_task", l: "Tem tarefa atrasada" },
  { v: "has_email", l: "Tem e-mail" },
  { v: "has_phone", l: "Tem telefone" },
];
const ACTION_OPTS: { v: AutomationAction["type"]; l: string }[] = [
  { v: "move_stage", l: "Mover para etapa" },
  { v: "add_tag", l: "Adicionar tag" },
  { v: "remove_tag", l: "Remover tag" },
  { v: "send_email", l: "Enviar e-mail (modelo)" },
  { v: "create_task", l: "Criar tarefa / agendamento" },
  { v: "set_temperature", l: "Mudar temperatura" },
  { v: "add_note", l: "Adicionar anotação" },
];

function newCondition(field: AutomationCondition["field"]): AutomationCondition {
  if (field === "tags_any" || field === "tags_none") return { field, value: [] };
  if (field === "temperature") return { field, value: ["quente"] };
  if (field === "value_gte" || field === "value_lte") return { field, value: 0 };
  return { field } as AutomationCondition;
}
function newAction(type: AutomationAction["type"], stages: PipelineStage[]): AutomationAction {
  switch (type) {
    case "move_stage": return { type, stage_id: stages[0]?.id ?? "" };
    case "add_tag": case "remove_tag": return { type, tag: "" };
    case "send_email": return { type, template_id: "" };
    case "create_task": return { type, kind: "follow_up", title: "Follow-up", days: 1, time: "10:00", priority: "media", duration: 30 };
    case "set_temperature": return { type, value: "quente" };
    case "add_note": return { type, text: "" };
  }
}

function actionSummary(a: AutomationAction, stages: PipelineStage[], templates: any[], tags: TagOpt[]) {
  const tagName = (s: string) => tags.find((t) => t.slug === s)?.name ?? s;
  switch (a.type) {
    case "move_stage": return `Mover para "${stages.find((s) => s.id === a.stage_id)?.name ?? "?"}"`;
    case "add_tag": return `Adicionar tag "${tagName(a.tag)}"`;
    case "remove_tag": return `Remover tag "${tagName(a.tag)}"`;
    case "send_email": return `Enviar "${templates.find((t) => t.id === a.template_id)?.name ?? "modelo"}"`;
    case "create_task": return `${KINDS.find((k) => k.v === a.kind)?.l}: ${a.title} (+${a.days}d ${a.time})`;
    case "set_temperature": return `Temperatura: ${a.value}`;
    case "add_note": return "Adicionar anotação";
  }
}

type Draft = {
  id?: string;
  name: string;
  stageId: string;
  active: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
};

export function AutomationsDialog({
  open, onOpenChange, initialTab = "automacoes", pipeline, stages, tags, organizationId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTab?: Tab;
  pipeline: { id: string; name: string } | null;
  stages: PipelineStage[];
  tags: TagOpt[];
  organizationId: string | null;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  const [draft, setDraft] = useState<Draft | null>(null);

  const listFn = useServerFn(listAutomations);
  const tplFn = useServerFn(listEmailTemplates);
  const saveFn = useServerFn(saveAutomation);
  const toggleFn = useServerFn(toggleAutomation);
  const delFn = useServerFn(deleteAutomation);

  const autoQ = useQuery({
    queryKey: ["automations", pipeline?.id],
    queryFn: () => listFn({ data: { pipelineId: pipeline!.id } }),
    enabled: open && !!pipeline,
  });
  const tplQ = useQuery({
    queryKey: ["email-templates", organizationId],
    queryFn: () => tplFn({ data: { organizationId: organizationId! } }),
    enabled: open && !!organizationId,
  });
  const automations = (autoQ.data?.automations ?? []) as any[];
  const runs = (autoQ.data?.runs ?? []) as any[];
  const templates = (tplQ.data?.templates ?? []) as any[];
  const notReady = autoQ.data && !autoQ.data.ready ? autoQ.data.message : null;

  const refresh = () => qc.invalidateQueries({ queryKey: ["automations", pipeline?.id] });
  const save = useMutation({
    mutationFn: (d: Draft) => saveFn({
      data: {
        id: d.id, organizationId: organizationId!, pipelineId: pipeline!.id, stageId: d.stageId,
        name: d.name, active: d.active, trigger: d.trigger as any, conditions: d.conditions as any, actions: d.actions as any,
        position: automations.filter((a) => a.stage_id === d.stageId).length,
      },
    }),
    onSuccess: () => { toast.success("Automação salva"); setDraft(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Automação removida"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = (stageId: string) =>
    setDraft({ name: "", stageId, active: true, trigger: { type: "on_enter" }, conditions: [], actions: [newAction("create_task", stages)] });
  const openEdit = (a: any) =>
    setDraft({ id: a.id, name: a.name, stageId: a.stage_id, active: a.active, trigger: a.trigger, conditions: a.conditions ?? [], actions: a.actions ?? [] });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-[min(1200px,96vw)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Automações do Kanban{pipeline ? ` · ${pipeline.name}` : ""}</DialogTitle>
          <DialogDescription>Defina, por etapa, quando o lead é movido e quais ações acontecem. Tudo fica na jornada do lead.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-3 self-start">
            <TabsTrigger value="automacoes">Automações</TabsTrigger>
            <TabsTrigger value="emails">Modelos de e-mail</TabsTrigger>
            <TabsTrigger value="execucoes">Execuções</TabsTrigger>
          </TabsList>

          <TabsContent value="automacoes" className="mt-0 min-h-[60vh] flex-1 overflow-hidden">
            {notReady && <p className="mx-5 mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{notReady}</p>}
            {/* Uma coluna por etapa, como no Digital Pipeline do Kommo */}
            <div className="flex h-full gap-3 overflow-x-auto px-5 py-4">
              {stages.map((s) => {
                const list = automations.filter((a) => a.stage_id === s.id);
                return (
                  <div key={s.id} className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30">
                    <div className="h-1.5 rounded-t-xl" style={{ background: s.color || "#64748b" }} />
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <p className="truncate text-sm font-semibold">{s.name}</p>
                      <span className="text-[11px] text-muted-foreground">{list.length}</span>
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                      {list.map((a) => (
                        <div key={a.id} className={cn("space-y-2 rounded-lg border bg-card p-3 shadow-sm", !a.active && "opacity-60")}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold leading-tight">{a.name}</p>
                            <Switch checked={a.active} onCheckedChange={(v) => toggle.mutate({ id: a.id, active: v })} aria-label="Ativa" />
                          </div>
                          <p className="flex items-center gap-1 text-[11px] text-primary"><Clock className="h-3 w-3" />{describeTrigger(a.trigger)}</p>
                          {(a.conditions ?? []).length > 0 && <p className="text-[11px] text-muted-foreground">Se: {(a.conditions as AutomationCondition[]).map((c) => CONDITION_OPTS.find((o) => o.v === c.field)?.l).join(" e ")}</p>}
                          <ul className="space-y-0.5 text-[11px]">
                            {(a.actions as AutomationAction[]).map((x, i) => (
                              <li key={i} className="flex items-center gap-1"><ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />{actionSummary(x, stages, templates, tags)}</li>
                            ))}
                          </ul>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Duplicar" onClick={() => setDraft({ ...openEditDraft(a), id: undefined, name: `${a.name} (cópia)` })}><Copy className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Editar" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Excluir" onClick={() => { if (confirm(`Excluir "${a.name}"?`)) remove.mutate(a.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" className="w-full border border-dashed" onClick={() => openNew(s.id)} disabled={!!notReady}>
                        <Plus className="mr-1 h-4 w-4" /> Adicionar automação
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="emails" className="mt-0 min-h-[60vh] flex-1 overflow-y-auto px-5 py-4">
            <EmailTemplatesPanel organizationId={organizationId} templates={templates} ready={tplQ.data?.ready ?? true} message={tplQ.data?.message ?? null} />
          </TabsContent>

          <TabsContent value="execucoes" className="mt-0 min-h-[60vh] flex-1 overflow-y-auto px-5 py-4">
            {runs.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p> : (
              <ul className="space-y-2">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                    {r.status === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{automations.find((a) => a.id === r.automation_id)?.name ?? "Automação"} · {r.leads?.name ?? "lead"}</p>
                      <p className="text-xs text-muted-foreground">{r.detail || r.status}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{format(parseISO(r.created_at), "dd/MM HH:mm")}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        {draft && (
          <AutomationEditor
            draft={draft}
            setDraft={setDraft}
            stages={stages}
            tags={tags}
            templates={templates}
            saving={save.isPending}
            onSave={() => save.mutate(draft)}
            onGoToEmails={() => { setDraft(null); setTab("emails"); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function openEditDraft(a: any): Draft {
  return { id: a.id, name: a.name, stageId: a.stage_id, active: a.active, trigger: a.trigger, conditions: a.conditions ?? [], actions: a.actions ?? [] };
}

function TagSelect({ tags, value, onChange }: { tags: TagOpt[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="h-9"><SelectValue placeholder="Escolha a tag" /></SelectTrigger>
      <SelectContent>
        {tags.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Configure as tags em "Tags de conversão".</div>}
        {tags.map((t) => (
          <SelectItem key={t.slug} value={t.slug}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: t.color }} />{t.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Editor: QUANDO → SE → ENTÃO. */
function AutomationEditor({
  draft, setDraft, stages, tags, templates, saving, onSave, onGoToEmails,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  stages: PipelineStage[];
  tags: TagOpt[];
  templates: any[];
  saving: boolean;
  onSave: () => void;
  onGoToEmails: () => void;
}) {
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const t = draft.trigger;
  const minutes = t.type === "after_time" ? t.minutes : 0;
  const unit = minutes && minutes % 1440 === 0 ? "d" : minutes && minutes % 60 === 0 ? "h" : "m";
  const amount = unit === "d" ? minutes / 1440 : unit === "h" ? minutes / 60 : minutes;
  const setTime = (n: number, u: string) => set({ trigger: { type: "after_time", minutes: Math.max(5, Math.round(n * (u === "d" ? 1440 : u === "h" ? 60 : 1))) } });
  const setCond = (i: number, c: AutomationCondition) => set({ conditions: draft.conditions.map((x, j) => (j === i ? c : x)) });
  const setAct = (i: number, a: AutomationAction) => set({ actions: draft.actions.map((x, j) => (j === i ? a : x)) });
  const stageName = stages.find((s) => s.id === draft.stageId)?.name ?? "";
  const valid = draft.name.trim() && draft.actions.length > 0 &&
    draft.actions.every((a) => (a.type === "move_stage" ? !!a.stage_id : a.type === "add_tag" || a.type === "remove_tag" ? !!a.tag : a.type === "send_email" ? !!a.template_id : a.type === "add_note" ? !!a.text.trim() : true)) &&
    (t.type === "on_enter_with_tag" || t.type === "on_tag_added" ? !!t.tag : true);

  return (
    <Dialog open onOpenChange={(v) => !v && setDraft(null)}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Editar automação" : "Nova automação"} · {stageName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Follow-up automático após proposta" maxLength={160} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm"><Switch checked={draft.active} onCheckedChange={(v) => set({ active: v })} /> Ativa</label>
          </div>
          <div className="space-y-1">
            <Label>Etapa</Label>
            <Select value={draft.stageId} onValueChange={(v) => set({ stageId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* QUANDO */}
          <section className="space-y-2 rounded-xl border-l-4 border-primary bg-primary/5 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Quando</p>
            <Select value={t.type} onValueChange={(v) => set({
              trigger: v === "after_time" ? { type: "after_time", minutes: 1440 } : v === "on_enter" ? { type: "on_enter" } : { type: v as "on_tag_added", tag: "" },
            })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="on_enter">Imediatamente ao entrar nesta etapa</SelectItem>
                <SelectItem value="after_time">Depois de um tempo na etapa</SelectItem>
                <SelectItem value="on_enter_with_tag">Ao entrar na etapa com uma tag</SelectItem>
                <SelectItem value="on_tag_added">Ao receber uma tag enquanto está nesta etapa</SelectItem>
              </SelectContent>
            </Select>
            {t.type === "after_time" && (
              <div className="flex items-center gap-2">
                <Input type="number" min={1} className="w-24" value={amount} onChange={(e) => setTime(Number(e.target.value || 1), unit)} />
                <Select value={unit} onValueChange={(u) => setTime(amount, u)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="m">minutos</SelectItem><SelectItem value="h">horas</SelectItem><SelectItem value="d">dias</SelectItem></SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">após a entrada do lead na etapa</span>
              </div>
            )}
            {(t.type === "on_enter_with_tag" || t.type === "on_tag_added") && (
              <TagSelect tags={tags} value={t.tag} onChange={(v) => set({ trigger: { ...t, tag: v } })} />
            )}
          </section>

          {/* SE */}
          <section className="space-y-2 rounded-xl border-l-4 border-amber-500 bg-amber-50/60 p-3 dark:bg-amber-950/20">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Se (condições — todas precisam valer)</p>
            {draft.conditions.length === 0 && <p className="text-xs text-muted-foreground">Sem condições: vale para todos os leads da etapa.</p>}
            {draft.conditions.map((c, i) => (
              <div key={i} className="grid grid-cols-[180px_minmax(0,1fr)_auto] items-center gap-2">
                <Select value={c.field} onValueChange={(v) => setCond(i, newCondition(v as AutomationCondition["field"]))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITION_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                </Select>
                <div>
                  {(c.field === "tags_any" || c.field === "tags_none") && (
                    <TagSelect tags={tags} value={(c.value as string[])[0] ?? ""} onChange={(v) => setCond(i, { ...c, value: [v] })} />
                  )}
                  {c.field === "temperature" && (
                    <div className="flex gap-1">
                      {TEMPS.map((x) => {
                        const on = (c.value as string[]).includes(x.v);
                        return (
                          <button key={x.v} type="button" onClick={() => setCond(i, { ...c, value: on ? (c.value as string[]).filter((y) => y !== x.v) : [...(c.value as string[]), x.v] })}
                            className={cn("rounded-full border px-2.5 py-1 text-xs", on && "border-primary bg-primary text-primary-foreground")}>{x.l}</button>
                        );
                      })}
                    </div>
                  )}
                  {(c.field === "value_gte" || c.field === "value_lte") && (
                    <Input type="number" className="h-9" value={c.value as number} onChange={(e) => setCond(i, { ...c, value: Number(e.target.value || 0) })} />
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" aria-label="Remover condição" onClick={() => set({ conditions: draft.conditions.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Select value="" onValueChange={(v) => set({ conditions: [...draft.conditions, newCondition(v as AutomationCondition["field"])] })}>
              <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="+ Adicionar condição" /></SelectTrigger>
              <SelectContent>{CONDITION_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
          </section>

          {/* ENTÃO */}
          <section className="space-y-2 rounded-xl border-l-4 border-emerald-500 bg-emerald-50/60 p-3 dark:bg-emerald-950/20">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Então (ações, em ordem)</p>
            {draft.actions.map((a, i) => (
              <div key={i} className="space-y-2 rounded-lg border bg-background p-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">{i + 1}</span>
                  <Select value={a.type} onValueChange={(v) => setAct(i, newAction(v as AutomationAction["type"], stages))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{ACTION_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive" aria-label="Remover ação" onClick={() => set({ actions: draft.actions.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {a.type === "move_stage" && (
                  <Select value={a.stage_id || undefined} onValueChange={(v) => setAct(i, { ...a, stage_id: v })}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Etapa de destino" /></SelectTrigger>
                    <SelectContent>{stages.filter((s) => s.id !== draft.stageId).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {(a.type === "add_tag" || a.type === "remove_tag") && <TagSelect tags={tags} value={a.tag} onChange={(v) => setAct(i, { ...a, tag: v })} />}
                {a.type === "set_temperature" && (
                  <Select value={a.value} onValueChange={(v) => setAct(i, { ...a, value: v as "quente" })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{TEMPS.map((x) => <SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {a.type === "send_email" && (
                  <div className="flex items-center gap-2">
                    <Select value={a.template_id || undefined} onValueChange={(v) => setAct(i, { ...a, template_id: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder={templates.length ? "Escolha o modelo" : "Nenhum modelo criado"} /></SelectTrigger>
                      <SelectContent>{templates.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="shrink-0" onClick={onGoToEmails}><Mail className="mr-1 h-3.5 w-3.5" /> Modelos</Button>
                  </div>
                )}
                {a.type === "create_task" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select value={a.kind} onValueChange={(v) => setAct(i, { ...a, kind: v as "follow_up" })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{KINDS.map((x) => <SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="h-9" value={a.title} onChange={(e) => setAct(i, { ...a, title: e.target.value })} placeholder="Título" maxLength={200} />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                      Agendar para daqui a <Input type="number" min={0} className="h-9 w-16" value={a.days} onChange={(e) => setAct(i, { ...a, days: Number(e.target.value || 0) })} /> dia(s), às
                      <Input type="time" className="h-9 w-24" value={a.time} onChange={(e) => setAct(i, { ...a, time: e.target.value || "10:00" })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={a.priority} onValueChange={(v) => setAct(i, { ...a, priority: v as "media" })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{PRIOS.map((x) => <SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={String(a.duration)} onValueChange={(v) => setAct(i, { ...a, duration: Number(v) })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{[15, 30, 45, 60, 90].map((m) => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {a.type === "add_note" && (
                  <Textarea rows={2} value={a.text} onChange={(e) => setAct(i, { ...a, text: e.target.value })} placeholder="Texto da anotação (aceita {nome}, {empresa}…)" maxLength={2000} />
                )}
              </div>
            ))}
            <Select value="" onValueChange={(v) => set({ actions: [...draft.actions, newAction(v as AutomationAction["type"], stages)] })}>
              <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="+ Adicionar ação" /></SelectTrigger>
              <SelectContent>{ACTION_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
          </section>

          <p className="text-[11px] text-muted-foreground">
            A automação roda uma vez por passagem do lead na etapa. Se ela mover o lead, as automações da etapa de destino também rodam (até 3 encadeamentos).
            E-mails saem pelo Gmail de quem criou a automação; tarefas entram na Agenda dessa pessoa e no Google Agenda.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
          <Button onClick={onSave} disabled={!valid || saving}><Zap className="mr-1 h-4 w-4" /> Salvar automação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Modelos de e-mail com variáveis e envio de teste. */
function EmailTemplatesPanel({
  organizationId, templates, ready, message,
}: { organizationId: string | null; templates: any[]; ready: boolean; message: string | null }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveEmailTemplate);
  const delFn = useServerFn(deleteEmailTemplate);
  const testFn = useServerFn(sendTestEmailTemplate);
  const [edit, setEdit] = useState<{ id?: string; name: string; subject: string; body: string } | null>(null);
  const [testTo, setTestTo] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const refresh = () => qc.invalidateQueries({ queryKey: ["email-templates", organizationId] });
  const isHtml = !!edit && isHtmlBody(edit.body);
  const previewDoc = !edit ? "" : isHtml
    ? sanitizeEmailHtml(renderTemplate(edit.body, SAMPLE_LEAD, SAMPLE_EXTRA, { html: true }))
    : `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5;padding:16px;white-space:pre-wrap">${renderTemplate(edit.body, SAMPLE_LEAD, SAMPLE_EXTRA).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`;

  const save = useMutation({
    mutationFn: () => saveFn({ data: { ...edit!, organizationId: organizationId! } }),
    onSuccess: () => { toast.success("Modelo salvo"); setEdit(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Modelo removido"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const test = useMutation({
    mutationFn: () => testFn({ data: { subject: edit!.subject, body: edit!.body, to: testTo } }),
    onSuccess: () => toast.success(`Teste enviado para ${testTo}`),
    onError: (e: Error) => toast.error(e.message),
  });
  const insertVar = (v: string) => setEdit((e) => (e ? { ...e, body: `${e.body}{${v}}` } : e));

  if (!ready) return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{message}</p>;

  if (edit) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="space-y-1"><Label>Nome do modelo</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Ex.: Boas-vindas" maxLength={120} /></div>
        <div className="space-y-1"><Label>Assunto</Label><Input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} placeholder="Ex.: {primeiro_nome}, recebemos seu contato" maxLength={300} /></div>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="flex items-center gap-2">
              Mensagem
              <Badge variant={isHtml ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">{isHtml ? "HTML" : "Texto"}</Badge>
            </Label>
            <div className="flex items-center gap-1">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted">
                <FileCode className="h-3.5 w-3.5" /> Importar .html
                <input type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 200_000) { toast.error("Arquivo maior que 200 KB."); return; }
                  file.text().then((txt) => setEdit((cur) => (cur ? { ...cur, body: txt } : cur)));
                  e.target.value = "";
                }} />
              </label>
              <div className="flex rounded-md bg-muted p-0.5 text-xs">
                {(["edit", "preview"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={cn("rounded px-2.5 py-1 font-medium", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}>
                    {m === "edit" ? "Editar" : "Visualizar"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {mode === "edit" ? (
            <Textarea
              rows={14}
              value={edit.body}
              onChange={(e) => setEdit({ ...edit, body: e.target.value })}
              placeholder={"Texto simples ou HTML.\nEx.: <h2>Olá {primeiro_nome}</h2><p>Recebemos seu contato…</p>"}
              className={cn(isHtml && "font-mono text-xs leading-relaxed")}
              spellCheck={!isHtml}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border bg-white">
              <p className="border-b bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">Assunto: <span className="font-medium text-foreground">{renderTemplate(edit.subject, SAMPLE_LEAD, SAMPLE_EXTRA) || "—"}</span> · com dados de exemplo</p>
              {/* sandbox sem scripts: o HTML do modelo não roda nada dentro do Core */}
              <iframe title="Pré-visualização do e-mail" sandbox="" className="h-[420px] w-full bg-white" srcDoc={previewDoc} />
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Aceita texto simples ou HTML (cole o código do seu editor de e-mail ou importe o arquivo). Scripts e formulários são removidos no envio. As variáveis funcionam nos dois formatos.</p>
          <div className="flex flex-wrap gap-1">
            {TEMPLATE_VARS.map((v) => (
              <button key={v} type="button" onClick={() => insertVar(v)} className="rounded-full bg-muted px-2 py-0.5 text-[11px] hover:bg-primary/10">{`{${v}}`}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
          <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="seu@email.com" className="h-8 max-w-xs" />
          <Button size="sm" variant="outline" disabled={!testTo || !edit.subject || test.isPending} onClick={() => test.mutate()}><Send className="mr-1 h-3.5 w-3.5" /> Enviar teste</Button>
          <span className="text-[11px] text-muted-foreground">Sai pelo seu Gmail conectado, com dados de exemplo.</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={!edit.name.trim() || !edit.subject.trim() || save.isPending}>Salvar modelo</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Modelos usados pela ação "Enviar e-mail" das automações.</p>
        <Button size="sm" onClick={() => { setMode("edit"); setEdit({ name: "", subject: "", body: "" }); }}><Plus className="mr-1 h-4 w-4" /> Novo modelo</Button>
      </div>
      {templates.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum modelo ainda.</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="space-y-1.5 rounded-xl border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><Mail className="h-4 w-4 text-primary" />{t.name}</p>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Editar" onClick={() => { setMode("edit"); setEdit({ id: t.id, name: t.name, subject: t.subject, body: t.body }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Excluir" onClick={() => { if (confirm(`Excluir "${t.name}"?`)) del.mutate(t.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <p className="truncate text-xs"><span className="text-muted-foreground">Assunto:</span> {t.subject}</p>
              <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                {isHtmlBody(t.body) && <Badge className="mr-1 h-4 px-1 text-[9px]">HTML</Badge>}
                {isHtmlBody(t.body) ? htmlToText(t.body) : t.body}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
        <Tag className="h-3 w-3" /> Variáveis: {TEMPLATE_VARS.map((v) => <Badge key={v} variant="outline" className="h-5 px-1.5 text-[10px]">{`{${v}}`}</Badge>)}
      </div>
    </div>
  );
}

export type { Tab as AutomationsTab };
