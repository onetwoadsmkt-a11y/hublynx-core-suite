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
function Timeline({ stages, primary, ink }: { stages: { name: string; start: string; end: string }[]; primary: string; ink: string }) {
  const valid = stages.filter((s) => s.start && s.end);
  if (!valid.length) return null;
  const min = valid.reduce((m, s) => (s.start < m ? s.start : m), valid[0].start);
  const max = valid.reduce((m, s) => (s.end > m ? s.end : m), valid[0].end);
  const total = Math.max(1, isoDiff(max, min) + 1);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-white/70">
        <span>{br(min)}</span><span>{total} dias</span><span>{br(max)}</span>
      </div>
      {valid.map((s, i) => {
        const left = (isoDiff(s.start, min) / total) * 100;
        const width = Math.max(2, (days(s) / total) * 100);
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[11px] font-semibold text-white">{s.name || `Etapa ${i + 1}`}</span>
            <div className="relative h-4 flex-1 rounded-full bg-white/10">
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-5xl overflow-hidden p-0 [&>button]:text-white [&>button]:opacity-80">
        <div className="flex max-h-[92dvh] flex-col">
          <DialogHeader className="space-y-3 p-5 text-white" style={{ background: `linear-gradient(135deg, ${ink} 0%, color-mix(in oklab, ${ink} 82%, ${primary}) 100%)` }}>
            <DialogTitle className="text-white">{template ? "Editar modelo" : "Novo modelo de projeto"}</DialogTitle>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_190px]">
              <div className="space-y-1">
                <Label className="text-xs text-white/80">Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Implantação de franquia" className="border-white/20 bg-white/10 text-white placeholder:text-white/50" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-white/80">Descrição</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" className="border-white/20 bg-white/10 text-white placeholder:text-white/50" />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs text-white/80"><CalendarRange className="h-3.5 w-3.5" /> Início do cronograma</Label>
                <Input type="date" value={ref} onChange={(e) => moveRef(e.target.value)} className="border-white/20 bg-white/10 text-white [color-scheme:dark]" />
              </div>
            </div>
            <Timeline stages={stages} primary={primary} ink={ink} />
          </DialogHeader>

          {/* Fundo mais escuro com as etapas em cards flutuantes */}
          <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ background: `color-mix(in oklab, ${ink} 72%, #070d1a)` }}>
            {/* Equipe do modelo: entra no projeto ao aplicar o modelo */}
            <section aria-label="Equipe do modelo" className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5 dark:bg-card">
              <div className="flex flex-wrap items-center gap-3 border-l-[6px] px-4 py-3" style={{ borderColor: primary, background: `color-mix(in oklab, ${primary} 8%, white)` }}>
                <Users className="h-5 w-5 shrink-0" style={{ color: ink }} />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-extrabold tracking-tight" style={{ color: ink }}>Equipe do modelo</p>
                  <p className="text-xs text-muted-foreground">Ao aplicar o modelo, estas pessoas entram no projeto (só com acesso ao módulo Projetos) e recebem as tarefas definidas para elas.</p>
                </div>
              </div>
              <div className="space-y-2 p-4">
                {members.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pessoa na equipe do modelo.</p>}
                {members.map((m) => (
                  <div key={m.user_id} className="grid items-center gap-2 rounded-xl border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_14rem_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{m.name || m.email}</p>
                      {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                    </div>
                    <Input value={m.department ?? ""} placeholder="Departamento (ex.: Compras)" className="h-9" maxLength={120}
                      onChange={(e) => patchMember(m.user_id, { department: e.target.value })} aria-label={`Departamento de ${m.name}`} />
                    <Select value={m.access_role} onValueChange={(v) => patchMember(m.user_id, { access_role: v as TemplateMember["access_role"] })}>
                      <SelectTrigger className="h-9 text-xs" aria-label={`Papel de ${m.name}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ROLE_LABEL) as TemplateMember["access_role"][]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-600" aria-label={`Tirar ${m.name} da equipe do modelo`} onClick={() => removeMember(m.user_id)}>
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
              </div>
            </section>

            {stages.map((s, i) => (
              <div key={i} className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5 dark:bg-card">
                <div className="flex items-center gap-3 border-l-[6px] px-4 py-3" style={{ borderColor: primary, background: `color-mix(in oklab, ${primary} 8%, white)` }}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow" style={{ background: ink }}>{i + 1}</span>
                  <Input
                    value={s.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                    placeholder="Nome da etapa"
                    className="h-9 border-0 bg-transparent px-1 text-lg md:text-lg font-extrabold tracking-tight shadow-none focus-visible:ring-1"
                    style={{ color: ink }}
                  />
                  <span className="hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white sm:inline" style={{ background: primary }}>
                    {brShort(s.start)} → {brShort(s.end)} · {days(s)}d
                  </span>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Subir etapa" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Descer etapa" onClick={() => move(i, 1)} disabled={i === stages.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" aria-label="Remover etapa" onClick={() => setStages((d) => d.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div className="grid gap-2 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Início</Label>
                      <Input type="date" value={s.start} min={ref} onChange={(e) => {
                        const v = e.target.value; if (!v) return;
                        const len = isoDiff(s.end, s.start);
                        patch(i, { start: v, end: isoAdd(v, Math.max(0, len)) });
                      }} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Prazo final</Label>
                      <Input type="date" value={s.end} min={s.start} onChange={(e) => e.target.value && patch(i, { end: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fase</Label>
                      <Input value={s.phase ?? ""} placeholder="Ex.: 1ª Fase" onChange={(e) => patch(i, { phase: e.target.value || null })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Semana</Label>
                      <Input value={s.week_label ?? ""} placeholder="Ex.: 1ª semana" onChange={(e) => patch(i, { week_label: e.target.value || null })} />
                    </div>
                  </div>
                  <div className="relative">
                    <AlertTriangle className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
                    <Input value={s.alert ?? ""} placeholder="Aviso importante da etapa (opcional)" className="pl-8" onChange={(e) => patch(i, { alert: e.target.value || null })} />
                  </div>

                  <div className="space-y-2 rounded-xl bg-muted/40 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tarefas padrão</p>
                    {s.tasks.map((t, k) => (
                      <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_150px_14rem_auto]">
                        <Input value={t.title} placeholder="Tarefa" className="h-9 bg-white dark:bg-background" onChange={(e) => patchTask(i, k, { title: e.target.value })} />
                        <Input type="date" value={t.due} min={s.start} className="col-span-2 h-9 bg-white sm:col-span-1 dark:bg-background" aria-label="Prazo da tarefa" onChange={(e) => e.target.value && patchTask(i, k, { due: e.target.value })} />
                        <Select
                          value={whoValue(t)}
                          onValueChange={(v) => patchTask(i, k, v === "cliente"
                            ? { responsible_type: "cliente", assignee_user_id: null }
                            : v === "equipe"
                              ? { responsible_type: "equipe", assignee_user_id: null }
                              : { responsible_type: "equipe", assignee_user_id: v.slice(2) })}
                        >
                          <SelectTrigger
                            className={`h-9 bg-white text-[12px] dark:bg-background ${t.responsible_type === "cliente" ? "border-amber-300 bg-amber-50 text-amber-800" : ""}`}
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
                                {members.map((m) => <SelectItem key={m.user_id} value={`u:${m.user_id}`}>{memberLabel(m)}</SelectItem>)}
                              </SelectGroup>
                            )}
                            <SelectItem value="cliente">Cliente (conclui pelo portal)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-600" aria-label="Remover tarefa padrão"
                          onClick={() => setStages((d) => d.map((x, j) => (j === i ? { ...x, tasks: x.tasks.filter((_, m) => m !== k) } : x)))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="h-8 text-xs" style={{ color: primary }}
                      onClick={() => setStages((d) => d.map((x, j) => (j === i ? { ...x, tasks: [...x.tasks, { title: "", due: x.start, responsible_type: "equipe", assignee_user_id: null }] } : x)))}>
                      <Plus className="h-3.5 w-3.5" /> Tarefa padrão
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full border-dashed border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={addStage}>
              <Plus className="h-4 w-4" /> Adicionar etapa
            </Button>
          </div>

          <DialogFooter className="flex-col gap-2 border-t bg-background p-4 sm:flex-row sm:items-center">
            {problems.length > 0 && <p className="mr-auto text-xs text-destructive">{problems[0]}</p>}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              style={{ background: primary }}
              className="text-white hover:opacity-90"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
