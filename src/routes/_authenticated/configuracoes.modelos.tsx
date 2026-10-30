import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Pencil, CalendarRange, AlertTriangle, ArrowUp, ArrowDown, Users, UserRound, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listOrgTeamMembers } from "@/lib/projects/access.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  listProjectTemplates,
  saveProjectTemplate,
  deleteProjectTemplate,
  type ProjectTemplate,
  type TemplateMember,
} from "@/lib/projects/stages.functions";
import { useBrandPalette } from "@/hooks/useBrandPalette";
import { datesToOffsets, isoAdd, isoDiff, offsetsToDates } from "@/lib/projects/template-dates";

export const Route = createFileRoute("/_authenticated/configuracoes/modelos")({
  head: () => ({
    meta: [
      { title: "Modelos de projeto — Hublynx" },
      {
        name: "description",
        content:
          "Crie roadmaps padrão por tipo de serviço e aplique as etapas automaticamente em novos projetos.",
      },
      { property: "og:title", content: "Modelos de projeto — Hublynx" },
      {
        property: "og:description",
        content: "Roadmaps padrão por tipo de serviço aplicados automaticamente em novos projetos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatesPage,
});

type TaskDraft = {
  title: string;
  due: string;
  responsible_type: "equipe" | "cliente";
  /** pessoa da equipe do modelo que executa (null = equipe, sem pessoa) */
  assignee_user_id: string | null;
};

const ROLE_LABEL: Record<TemplateMember["access_role"], string> = {
  executor: "Executor (só as tarefas dele)",
  editor: "Editor (todas as tarefas)",
  gestor: "Gestor do projeto",
  visualizador: "Só visualiza",
};

/** Valor do seletor "quem executa": cliente, equipe sem pessoa ou uma pessoa. */
const whoValue = (t: TaskDraft) =>
  t.responsible_type === "cliente" ? "cliente" : t.assignee_user_id ? `u:${t.assignee_user_id}` : "equipe";
type StageDraft = {
  name: string;
  start: string;
  end: string;
  phase: string | null;
  week_label: string | null;
  alert: string | null;
  tasks: TaskDraft[];
};

const todayIso = () => format(new Date(), "yyyy-MM-dd");
const br = (iso: string) => (iso ? format(parseISO(iso), "dd/MM/yyyy") : "—");
const brShort = (iso: string) => (iso ? format(parseISO(iso), "dd MMM", { locale: ptBR }) : "—");
const days = (s: { start: string; end: string }) => Math.max(1, isoDiff(s.end, s.start) + 1);

/** Converte um modelo salvo em etapas com datas a partir da data de referência. */
function toDrafts(ref: string, t: ProjectTemplate): StageDraft[] {
  const dated = offsetsToDates(ref, t.stages.map((s) => ({
    start_offset_days: s.start_offset_days ?? null,
    duration_days: s.duration_days ?? null,
    tasks: (s.tasks ?? []).map((k) => ({ due_offset_days: k.due_offset_days ?? 0 })),
  })));
  return t.stages.map((s, i) => ({
    name: s.name,
    start: dated[i].start,
    end: dated[i].end,
    phase: s.phase ?? null,
    week_label: s.week_label ?? null,
    alert: s.alert ?? null,
    tasks: (s.tasks ?? []).map((k, j) => ({
      title: k.title,
      due: dated[i].tasks[j].due,
      responsible_type: k.responsible_type ?? "equipe",
      assignee_user_id: k.assignee_user_id ?? null,
    })),
  }));
}

function defaultDrafts(ref: string): StageDraft[] {
  const plan: [string, number][] = [["Briefing", 3], ["Planejamento", 5], ["Produção", 14], ["Aprovação", 3], ["Entrega", 2]];
  let cursor = ref;
  return plan.map(([name, d]) => {
    const st = { name, start: cursor, end: isoAdd(cursor, d - 1), phase: null, week_label: null, alert: null, tasks: [] };
    cursor = isoAdd(st.end, 1);
    return st;
  });
}

/** Linha do tempo dos prazos (mini Gantt) nas cores da marca. */
function Timeline({ stages, primary, ink, light = false }: { stages: { name: string; start: string; end: string }[]; primary: string; ink: string; light?: boolean }) {
  const valid = stages.filter((s) => s.start && s.end);
  if (!valid.length) return null;
  const min = valid.reduce((m, s) => (s.start < m ? s.start : m), valid[0].start);
  const max = valid.reduce((m, s) => (s.end > m ? s.end : m), valid[0].end);
  const total = Math.max(1, isoDiff(max, min) + 1);
  return (
    <div className="space-y-1.5">
      <div className={`flex justify-between text-[10px] font-medium uppercase tracking-wider ${light ? "text-muted-foreground" : "text-white/70"}`}>
        <span>{br(min)}</span><span>{total} dias</span><span>{br(max)}</span>
      </div>
      {valid.map((s, i) => {
        const left = (isoDiff(s.start, min) / total) * 100;
        const width = Math.max(2, (days(s) / total) * 100);
        return (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-40 shrink-0 truncate text-[11px] font-semibold ${light ? "text-foreground" : "text-white"}`}>{s.name || `Etapa ${i + 1}`}</span>
            <div className={`relative h-4 flex-1 rounded-full ${light ? "bg-muted" : "bg-white/10"}`}>
              <div
                className="absolute top-0 h-4 rounded-full shadow"
                style={{ left: `${left}%`, width: `${width}%`, background: i % 2 ? `color-mix(in oklab, ${primary} 70%, white)` : primary }}
                title={`${br(s.start)} → ${br(s.end)}`}
              />
            </div>
          </div>
        );
      })}
      <span className="sr-only" style={{ color: ink }} />
    </div>
  );
}

function TemplatesPage() {
  const qc = useQueryClient();
  const { activeOrg, isOrgAdmin } = useOrgAccess();
  const listFn = useServerFn(listProjectTemplates);
  const saveFn = useServerFn(saveProjectTemplate);
  const delFn = useServerFn(deleteProjectTemplate);
  const { primary, ink } = useBrandPalette();

  const [editing, setEditing] = useState<ProjectTemplate | null>(null);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["project-templates"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return [] as ProjectTemplate[];
      return listFn();
    },
    staleTime: 60_000,
    retry: false,
  });

  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Modelo removido");
      qc.invalidateQueries({ queryKey: ["project-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templates = q.data ?? [];
  const ref = todayIso();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: ink }}>Modelos de projeto</h1>
          <p className="text-sm text-muted-foreground">
            Roadmaps padrão com datas e prazos. Ao aplicar num projeto, o cronograma é recalculado a partir da data de início do projeto.
          </p>
        </div>
        <Button
          disabled={!activeOrg || !isOrgAdmin}
          style={{ background: primary }}
          className="text-white hover:opacity-90"
          onClick={() => { setEditing(null); setOpen(true); }}
        >
          <Plus className="h-4 w-4" /> Novo modelo
        </Button>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : templates.length === 0 ? (
        <Card className="rounded-2xl p-6 text-sm text-muted-foreground">Nenhum modelo cadastrado ainda.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => {
            const drafts = toDrafts(ref, t);
            const last = drafts[drafts.length - 1];
            return (
              <div key={t.id} className="overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-xl">
                <div className="space-y-3 p-4 text-white" style={{ background: `linear-gradient(135deg, ${ink} 0%, color-mix(in oklab, ${ink} 80%, ${primary}) 100%)` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold">{t.name}</p>
                      {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-white/75">{t.description}</p>}
                    </div>
                    {isOrgAdmin && (
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" aria-label="Editar modelo" className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
                          onClick={() => { setEditing(t); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Remover modelo" className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
                          onClick={() => { if (confirm(`Remover o modelo "${t.name}"?`)) delM.mutate(t.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <Timeline stages={drafts} primary={primary} ink={ink} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
                  <span><strong className="text-foreground">{drafts.length}</strong> etapa(s) · <strong className="text-foreground">{drafts.reduce((n, s) => n + s.tasks.length, 0)}</strong> tarefa(s) padrão{(t.members ?? []).length > 0 && <> · <strong className="text-foreground">{t.members.length}</strong> na equipe</>}</span>
                  {last && <span>Prazo total: <strong className="text-foreground">{isoDiff(last.end, ref) + 1} dias</strong> (se começasse hoje, até {br(last.end)})</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TemplateDialog
        open={open}
        onOpenChange={setOpen}
        template={editing}
        organizationId={activeOrg?.id ?? null}
        primary={primary}
        ink={ink}
        onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["project-templates"] }); }}
        save={(payload) => saveFn({ data: payload })}
      />
    </div>
  );
}

function TemplateDialog({
  open, onOpenChange, template, organizationId, primary, ink, onSaved, save,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: ProjectTemplate | null;
  organizationId: string | null;
  primary: string;
  ink: string;
  onSaved: () => void;
  save: (payload: any) => Promise<any>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ref, setRef] = useState(todayIso());
  const [stages, setStages] = useState<StageDraft[]>([]);
  const [members, setMembers] = useState<TemplateMember[]>([]);
  const [pick, setPick] = useState("");
  const orgId = template?.organization_id ?? organizationId;
  const teamFn = useServerFn(listOrgTeamMembers);
  const teamQ = useQuery({
    queryKey: ["org-team-members", orgId],
    queryFn: () => teamFn({ data: { organizationId: orgId! } }),
    enabled: open && !!orgId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    const r = todayIso();
    setRef(r);
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setStages(template && template.stages.length ? toDrafts(r, template) : defaultDrafts(r));
    setMembers(template?.members ?? []);
    setPick("");
  }, [open, template]);

  const available = (teamQ.data ?? []).filter((p) => !members.some((m) => m.user_id === p.user_id));
  const addMember = (userId: string) => {
    const p = (teamQ.data ?? []).find((x) => x.user_id === userId);
    if (!p) return;
    setMembers((d) => [...d, { user_id: p.user_id, name: p.name, email: p.email, department: null, access_role: "executor" }]);
    setPick("");
  };
  const patchMember = (userId: string, p: Partial<TemplateMember>) =>
    setMembers((d) => d.map((m) => (m.user_id === userId ? { ...m, ...p } : m)));
  const removeMember = (userId: string) => {
    setMembers((d) => d.filter((m) => m.user_id !== userId));
    // tarefas dessa pessoa voltam para "Equipe"
    setStages((d) => d.map((s) => ({ ...s, tasks: s.tasks.map((t) => (t.assignee_user_id === userId ? { ...t, assignee_user_id: null } : t)) })));
  };
  const memberLabel = (m: TemplateMember) => `${m.name || m.email || "Pessoa"}${m.department ? ` · ${m.department}` : ""}`;

  /** Mudar a data de referência leva todo o cronograma junto. */
  const moveRef = (next: string) => {
    if (!next) return;
    const delta = isoDiff(next, ref);
    setRef(next);
    setStages((d) => d.map((s) => ({
      ...s, start: isoAdd(s.start, delta), end: isoAdd(s.end, delta),
      tasks: s.tasks.map((t) => ({ ...t, due: isoAdd(t.due, delta) })),
    })));
  };
  const patch = (i: number, p: Partial<StageDraft>) => setStages((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const patchTask = (i: number, k: number, p: Partial<TaskDraft>) =>
    setStages((d) => d.map((x, j) => (j === i ? { ...x, tasks: x.tasks.map((y, m) => (m === k ? { ...y, ...p } : y)) } : x)));
  const move = (i: number, dir: -1 | 1) => setStages((d) => {
    const j = i + dir;
    if (j < 0 || j >= d.length) return d;
    const c = [...d]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });
  const addStage = () => setStages((d) => {
    const last = d[d.length - 1];
    const start = last ? isoAdd(last.end, 1) : ref;
    return [...d, { name: "", start, end: isoAdd(start, 6), phase: null, week_label: null, alert: null, tasks: [] }];
  });

  const problems = useMemo(() => stages.flatMap((s, i) => {
    const out: string[] = [];
    if (s.start < ref) out.push(`Etapa ${i + 1} começa antes da data de início.`);
    if (s.end < s.start) out.push(`Etapa ${i + 1}: o prazo final é antes do início.`);
    s.tasks.forEach((t, k) => { if (t.due < s.start) out.push(`Etapa ${i + 1}, tarefa ${k + 1}: prazo antes do início da etapa.`); });
    return out;
  }), [stages, ref]);

  const m = useMutation({
    mutationFn: () => {
      const clean = stages.map((s) => ({ ...s, name: s.name.trim(), tasks: s.tasks.filter((t) => t.title.trim()) })).filter((s) => s.name);
      const offsets = datesToOffsets(ref, clean.map((s) => ({ start: s.start, end: s.end, tasks: s.tasks.map((t) => ({ due: t.due })) })));
      return save({
        ...(template ? { id: template.id } : {}),
        organization_id: template?.organization_id ?? organizationId,
        name: name.trim(),
        description: description.trim() || null,
        stages: clean.map((s, i) => ({
          name: s.name,
          duration_days: offsets[i].duration_days,
          phase: s.phase?.trim() || null,
          week_label: s.week_label?.trim() || null,
          start_offset_days: offsets[i].start_offset_days,
          alert: s.alert?.trim() || null,
          tasks: s.tasks.map((t, k) => ({
            title: t.title.trim(),
            due_offset_days: offsets[i].tasks[k].due_offset_days,
            responsible_type: t.responsible_type,
            visible_to_client: t.responsible_type === "cliente",
            assignee_user_id: t.responsible_type === "cliente" ? null : t.assignee_user_id,
          })),
        })),
        members: members.map((m) => ({
          user_id: m.user_id,
          name: m.name,
          email: m.email,
          department: m.department?.trim() || null,
          access_role: m.access_role,
        })),
      });
    },
    onSuccess: () => { toast.success("Modelo salvo"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [tab, setTab] = useState<"etapas" | "equipe" | "cronograma">("etapas");
  const [sel, setSel] = useState(0);
  const [showTimeline, setShowTimeline] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTab("etapas");
    setSel(0);
    setShowTimeline(false);
  }, [open, template]);
  const selIdx = Math.min(sel, Math.max(0, stages.length - 1));
  const cur = stages[selIdx] ?? null;
  const totalTasks = stages.reduce((n, s) => n + s.tasks.length, 0);
  const phases = [...new Set(stages.map((s) => s.phase).filter(Boolean))] as string[];
  const first = stages.reduce<string | null>((m, s) => (s.start && (!m || s.start < m) ? s.start : m), null);
  const last = stages.reduce<string | null>((m, s) => (s.end && (!m || s.end > m) ? s.end : m), null);
  const totalDays = first && last ? isoDiff(last, first) + 1 : 0;
  const phaseTone = (ph: string | null) => {
    const k = ph ? phases.indexOf(ph) : -1;
    return k <= 0 ? primary : `color-mix(in oklab, ${primary} ${Math.max(55, 100 - k * 18)}%, ${ink})`;
  };
  const moveTask = (i: number, k: number, dir: -1 | 1) =>
    setStages((d) => d.map((x, j) => {
      if (j !== i) return x;
      const n = k + dir;
      if (n < 0 || n >= x.tasks.length) return x;
      const t = [...x.tasks]; [t[k], t[n]] = [t[n], t[k]];
      return { ...x, tasks: t };
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94dvh] max-h-[94dvh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        {/* cabeçalho compacto */}
        <DialogHeader className="space-y-3 border-b bg-background px-5 pt-4 text-left sm:px-6">
          <DialogTitle className="pr-8 text-xl font-extrabold">{template ? "Editar modelo de projeto" : "Novo modelo de projeto"}</DialogTitle>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_180px]">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Implantação de franquia" className="font-semibold" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"><CalendarRange className="h-3.5 w-3.5" /> Início do cronograma</Label>
              <Input type="date" value={ref} onChange={(e) => moveRef(e.target.value)} />
            </div>
          </div>

          {/* cronograma recolhido: resumo + faixa das fases */}
          <div className="space-y-2 rounded-xl border px-3.5 py-2.5" style={{ background: `color-mix(in oklab, ${primary} 9%, white)`, borderColor: `color-mix(in oklab, ${primary} 35%, white)` }}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
              <span><strong>{stages.length}</strong> etapas</span>
              {phases.length > 0 && <span><strong>{phases.length}</strong> fases</span>}
              <span><strong>{totalTasks}</strong> tarefas</span>
              {first && last && <span><strong>{totalDays}</strong> dias · {br(first)} → {br(last)}</span>}
              <span><strong>{members.length}</strong> {members.length === 1 ? "pessoa" : "pessoas"} na equipe</span>
              <div aria-hidden="true" className="flex h-2.5 min-w-[160px] flex-1 gap-0.5 overflow-hidden rounded-full">
                {stages.map((s, i) => (
                  <span key={i} style={{ flex: Math.max(1, days(s)), background: phaseTone(s.phase) }} title={s.name} />
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="h-8 bg-white" onClick={() => setShowTimeline((v) => !v)} aria-expanded={showTimeline}>
                {showTimeline ? "Recolher cronograma ▴" : "Ver cronograma ▾"}
              </Button>
            </div>
            {showTimeline && <Timeline stages={stages} primary={primary} ink={ink} light />}
          </div>

          <div role="tablist" aria-label="Partes do modelo" className="flex gap-6">
            {([
              ["etapas", "Etapas e tarefas", stages.length],
              ["equipe", "Equipe do modelo", members.length],
              ["cronograma", "Cronograma", null],
            ] as const).map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`-mb-px flex h-11 items-center gap-2 border-b-[3px] px-1 text-sm ${tab === k ? "font-extrabold text-foreground" : "border-transparent font-semibold text-muted-foreground hover:text-foreground"}`}
                style={tab === k ? { borderColor: primary } : undefined}
              >
                {label}
                {n !== null && (
                  <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full px-1.5 text-xs font-bold" style={tab === k ? { background: primary, color: ink } : { background: "hsl(var(--muted))" }}>
                    {n}
                  </span>
                )}
              </button>
            ))}
          </div>
        </DialogHeader>

        {/* corpo */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-5 py-4 sm:px-6">
          {tab === "etapas" && (
            <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
              <nav aria-label="Etapas do modelo" className="space-y-0.5 rounded-2xl border bg-background p-2.5 lg:sticky lg:top-0">
                {stages.map((s, i) => {
                  const newPhase = s.phase && s.phase !== stages[i - 1]?.phase;
                  const active = i === selIdx;
                  return (
                    <div key={i}>
                      {newPhase && <p className="px-2.5 pb-1 pt-3 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground first:pt-1">{s.phase}</p>}
                      <button
                        type="button"
                        onClick={() => setSel(i)}
                        aria-current={active ? "step" : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${active ? "" : "hover:bg-muted"}`}
                        style={active ? { background: `color-mix(in oklab, ${primary} 14%, white)`, outline: `2px solid ${primary}` } : undefined}
                      >
                        <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-xs font-extrabold" style={active ? { background: primary, color: ink } : { background: "hsl(var(--muted))" }}>{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm ${active ? "font-extrabold" : "font-semibold"}`}>{s.name || `Etapa ${i + 1}`}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[s.week_label, `${brShort(s.start)} → ${brShort(s.end)}`, `${s.tasks.length} tarefa${s.tasks.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    </div>
                  );
                })}
                <Button variant="outline" size="sm" className="mt-2 w-full border-dashed" onClick={() => { addStage(); setSel(stages.length); }}>
                  <Plus className="h-4 w-4" /> Adicionar etapa
                </Button>
              </nav>

              {cur ? (
                <section aria-label={`Etapa ${selIdx + 1}`} className="space-y-4">
                  <div className="space-y-3 rounded-2xl border bg-background p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: ink }}>{selIdx + 1}</span>
                      <Input
                        value={cur.name}
                        onChange={(e) => patch(selIdx, { name: e.target.value })}
                        placeholder="Nome da etapa"
                        className="h-11 min-w-[200px] flex-1 border-transparent bg-muted/50 text-lg font-extrabold md:text-lg"
                        aria-label="Nome da etapa"
                      />
                      <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Subir etapa" disabled={selIdx === 0} onClick={() => { move(selIdx, -1); setSel(selIdx - 1); }}><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Descer etapa" disabled={selIdx === stages.length - 1} onClick={() => { move(selIdx, 1); setSel(selIdx + 1); }}><ArrowDown className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" className="h-9 text-rose-600" onClick={() => {
                        if (!confirm(`Excluir a etapa "${cur.name || selIdx + 1}" e as tarefas dela?`)) return;
                        setStages((d) => d.filter((_, j) => j !== selIdx));
                        setSel(Math.max(0, selIdx - 1));
                      }}>
                        <Trash2 className="h-4 w-4" /> Excluir etapa
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Início</Label>
                        <Input type="date" value={cur.start} min={ref} onChange={(e) => {
                          const v = e.target.value; if (!v) return;
                          const len = isoDiff(cur.end, cur.start);
                          patch(selIdx, { start: v, end: isoAdd(v, Math.max(0, len)) });
                        }} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Prazo final</Label>
                        <Input type="date" value={cur.end} min={cur.start} onChange={(e) => e.target.value && patch(selIdx, { end: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Fase</Label>
                        <Input value={cur.phase ?? ""} placeholder="Ex.: 1ª Fase" onChange={(e) => patch(selIdx, { phase: e.target.value || null })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Semana</Label>
                        <Input value={cur.week_label ?? ""} placeholder="Ex.: 1ª semana" onChange={(e) => patch(selIdx, { week_label: e.target.value || null })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Aviso da etapa</Label>
                      <div className="relative">
                        <AlertTriangle className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
                        <Input value={cur.alert ?? ""} placeholder="Aviso importante da etapa (opcional)" className="pl-8" onChange={(e) => patch(selIdx, { alert: e.target.value || null })} />
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border bg-background">
                    <div className="flex items-center justify-between px-4 py-3">
                      <p className="flex items-center gap-2 text-[15px] font-extrabold">
                        Tarefas padrão
                        <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-muted px-1.5 text-xs font-bold">{cur.tasks.length}</span>
                      </p>
                    </div>
                    <div className="hidden grid-cols-[56px_minmax(0,1fr)_150px_15rem_40px] gap-2 bg-muted/50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground md:grid">
                      <span>Ordem</span><span>Tarefa</span><span>Prazo</span><span>Quem executa</span><span />
                    </div>
                    {cur.tasks.length === 0 && <p className="border-t px-4 py-4 text-sm text-muted-foreground">Nenhuma tarefa padrão nesta etapa.</p>}
                    {cur.tasks.map((t, k) => (
                      <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t px-4 py-2 md:grid-cols-[56px_minmax(0,1fr)_150px_15rem_40px]">
                        <div className="hidden items-center md:flex">
                          <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Subir tarefa" disabled={k === 0} onClick={() => moveTask(selIdx, k, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Descer tarefa" disabled={k === cur.tasks.length - 1} onClick={() => moveTask(selIdx, k, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
                        </div>
                        <Input value={t.title} placeholder="Tarefa" className="h-9" onChange={(e) => patchTask(selIdx, k, { title: e.target.value })} />
                        <Input type="date" value={t.due} min={cur.start} className="col-span-2 h-9 md:col-span-1" aria-label="Prazo da tarefa" onChange={(e) => e.target.value && patchTask(selIdx, k, { due: e.target.value })} />
                        <Select
                          value={whoValue(t)}
                          onValueChange={(v) => patchTask(selIdx, k, v === "cliente"
                            ? { responsible_type: "cliente", assignee_user_id: null }
                            : v === "equipe"
                              ? { responsible_type: "equipe", assignee_user_id: null }
                              : { responsible_type: "equipe", assignee_user_id: v.slice(2) })}
                        >
                          <SelectTrigger
                            className={`h-9 text-[12px] ${t.responsible_type === "cliente" ? "border-amber-300 bg-amber-50 text-amber-800" : ""}`}
                            aria-label="Quem executa a tarefa"
                          >
                            {t.responsible_type === "cliente" ? <UserRound className="mr-1 h-3.5 w-3.5 shrink-0" /> : <Users className="mr-1 h-3.5 w-3.5 shrink-0" />}
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equipe">Equipe (sem pessoa)</SelectItem>
                            {members.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Equipe do modelo</SelectLabel>
                                {members.map((mm) => <SelectItem key={mm.user_id} value={`u:${mm.user_id}`}>{memberLabel(mm)}</SelectItem>)}
                              </SelectGroup>
                            )}
                            <SelectItem value="cliente">Cliente (conclui pelo portal)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-600" aria-label="Remover tarefa padrão"
                          onClick={() => setStages((d) => d.map((x, j) => (j === selIdx ? { ...x, tasks: x.tasks.filter((_, mi) => mi !== k) } : x)))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <div className="border-t px-4 py-2.5">
                      <Button variant="outline" size="sm" className="border-dashed"
                        onClick={() => setStages((d) => d.map((x, j) => (j === selIdx ? { ...x, tasks: [...x.tasks, { title: "", due: x.start, responsible_type: "equipe", assignee_user_id: null }] } : x)))}>
                        <Plus className="h-3.5 w-3.5" /> Tarefa padrão
                      </Button>
                    </div>
                  </div>
                </section>
              ) : (
                <p className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground">Nenhuma etapa. Use “Adicionar etapa”.</p>
              )}
            </div>
          )}

          {tab === "equipe" && (
            <section aria-label="Equipe do modelo" className="space-y-3 rounded-2xl border bg-background p-4">
              <p className="text-sm text-muted-foreground">
                Ao aplicar o modelo, estas pessoas entram no projeto (só com acesso ao módulo Projetos) e recebem as tarefas definidas para elas.
              </p>
              {members.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pessoa na equipe do modelo.</p>}
              {members.map((mm) => (
                <div key={mm.user_id} className="grid items-center gap-2 rounded-xl border p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_14rem_auto]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{mm.name || mm.email}</p>
                    {mm.email && <p className="truncate text-xs text-muted-foreground">{mm.email}</p>}
                  </div>
                  <Input value={mm.department ?? ""} placeholder="Departamento (ex.: Compras)" className="h-9" maxLength={120}
                    onChange={(e) => patchMember(mm.user_id, { department: e.target.value })} aria-label={`Departamento de ${mm.name}`} />
                  <Select value={mm.access_role} onValueChange={(v) => patchMember(mm.user_id, { access_role: v as TemplateMember["access_role"] })}>
                    <SelectTrigger className="h-9 text-xs" aria-label={`Papel de ${mm.name}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROLE_LABEL) as TemplateMember["access_role"][]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-600" aria-label={`Tirar ${mm.name} da equipe do modelo`} onClick={() => removeMember(mm.user_id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Select value={pick} onValueChange={addMember} disabled={teamQ.isLoading || available.length === 0}>
                  <SelectTrigger className="h-9 w-full sm:w-80" aria-label="Adicionar pessoa à equipe do modelo">
                    <UserPlus className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder={teamQ.isLoading ? "Carregando equipe…" : available.length ? "Adicionar pessoa da empresa" : "Toda a equipe já está no modelo"} />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.name}{p.email && p.email !== p.name ? ` · ${p.email}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Pessoa nova ainda sem acesso? Convide pela aba Equipe e permissões de um projeto e depois inclua aqui.</p>
              </div>
            </section>
          )}

          {tab === "cronograma" && (
            <section aria-label="Cronograma" className="rounded-2xl border bg-background p-4">
              <Timeline stages={stages} primary={primary} ink={ink} light />
            </section>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 border-t bg-background px-5 py-3 sm:flex-row sm:items-center sm:px-6">
          {problems.length > 0 && <p className="mr-auto text-xs text-destructive">{problems[0]}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            style={{ background: primary, color: ink }}
            className="font-extrabold hover:opacity-90"
            onClick={() => {
              if (!name.trim()) return toast.error("Informe o nome do modelo");
              if (!(template?.organization_id ?? organizationId)) return toast.error("Empresa não identificada");
              if (!stages.some((s) => s.name.trim())) return toast.error("Adicione ao menos uma etapa");
              if (problems.length) return toast.error(problems[0]);
              m.mutate();
            }}
            disabled={m.isPending}
          >
            Salvar modelo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
