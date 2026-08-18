import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  getProjectDashboard, upsertMilestone, deleteMilestone,
  upsertMember, deleteMember, upsertRisk, deleteRisk,
  upsertCost, deleteCost, saveProjectNotes, deleteProject,
  generateRecurringInvoice,
  type ProjectStatus,
} from "@/lib/projects/projects.functions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Plus, Pencil, Trash2, AlertTriangle, CheckCircle2, Clock,
  TrendingUp, DollarSign, Users as UsersIcon, Calendar as CalIcon, AlertCircle,
  Activity as ActivityIcon, FileText, Target, Briefcase, Flag, Hourglass,
  UserCheck, ListChecks, ArrowRight, Sparkles, Wallet,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { RoadmapStagesPanel } from "@/components/projects/RoadmapStages";
import { ProjectCommercialTable } from "@/components/projects/ProjectCommercialTable";
import { RichTextEditor } from "@/components/tasks/RichTextEditor";
import { TaskDrawer } from "@/components/tasks/TaskDrawer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { maskBRL } from "@/lib/security/value-lock";

export const Route = createFileRoute("/_authenticated/projetos/$id")({
  head: () => ({ meta: [{ title: "Projeto — Hublynx Core" }] }),
  component: ProjectCommandCenter,
});

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planejamento: "Planejamento", ativo: "Ativo", aguardando_cliente: "Aguardando Cliente",
  em_pausa: "Em Pausa", concluido: "Concluído", cancelado: "Cancelado",
};
const STATUS_TONE: Record<ProjectStatus, string> = {
  planejamento: "bg-blue-50 text-blue-700 border-blue-200",
  ativo: "bg-emerald-50 text-emerald-700 border-emerald-200",
  aguardando_cliente: "bg-amber-50 text-amber-700 border-amber-200",
  em_pausa: "bg-slate-100 text-slate-700 border-slate-200",
  concluido: "bg-violet-50 text-violet-700 border-violet-200",
  cancelado: "bg-rose-50 text-rose-700 border-rose-200",
};

const KANBAN_LABEL: Record<string, string> = {
  a_fazer: "A Fazer", em_andamento: "Em Andamento",
  em_revisao: "Em Revisão", concluido: "Concluído", cancelado: "Cancelado",
};

const COMMERCIAL_LABEL: Record<string, string> = {
  projeto_fechado: "Projeto Fechado",
  mensal_recorrente: "Mensal Recorrente",
  banco_horas: "Banco de Horas",
  por_hora: "Por Hora",
  suporte_continuo: "Suporte Contínuo",
};
const SERVICE_LABEL: Record<string, string> = {
  desenvolvimento: "Desenvolvimento", trafego_pago: "Tráfego Pago",
  gestao_conteudo: "Conteúdo", consultoria: "Consultoria",
  design: "Design", suporte: "Suporte", outros: "Outros",
};


function brl(n: number) {
  return maskBRL(n);
}

function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("pt-BR") : "—";
}

function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `há ${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function HealthBadge({ health }: { health: "healthy" | "attention" | "critical" }) {
  const map = {
    healthy: { label: "Saudável", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    attention: { label: "Atenção", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
    critical: { label: "Crítico", cls: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  } as const;
  const m = map[health];
  return (
    <Badge className={`${m.cls} border gap-1.5`} variant="outline">
      <span className={`h-2 w-2 rounded-full ${m.dot}`} />{m.label}
    </Badge>
  );
}

function KpiTile({ icon: Icon, label, value, sub, tone = "" }: any) {
  return (
    <div className="rounded-2xl border bg-card p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className={`text-xl font-semibold mt-2 ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// =====================================================
function ProjectCommandCenter() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const getDash = useServerFn(getProjectDashboard);
  const dashQ = useQuery({
    queryKey: ["project-dashboard", id],
    queryFn: () => getDash({ data: { id } }),
  });

  const [editOpen, setEditOpen] = useState(false);
  const delFn = useServerFn(deleteProject);
  const delM = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Projeto excluído");
      navigate({ to: "/projetos" });
    },
  });

  if (dashQ.isLoading) return <div className="p-8 text-muted-foreground">Carregando projeto...</div>;
  if (dashQ.error || !dashQ.data) return <div className="p-8 text-rose-600">Erro ao carregar.</div>;

  const d: any = dashQ.data;
  const p: any = d.project;

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/projetos"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700"
            onClick={() => { if (confirm("Excluir este projeto?")) delM.mutate(); }}>
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
        </div>
      </div>

      <div className="space-y-6 min-w-0">
        <ExecutiveHeader p={p} d={d} />
        <AlertsBar alerts={d.alerts} nextMilestone={d.nextMilestone} />
        <RoadmapStagesPanel
          projectId={id}
          stages={p.roadmap_stages}
          disabled={p.commercial_model === "mensal_recorrente"}
          disabledMessage="Roadmap indisponível para projetos do tipo Mensal Recorrente."
        />
        <ExecutionPanel execution={d.execution} onOpenTask={(tid: string) => navigate({ to: "/tarefas", search: { task: tid } as any })} />
        <PlannedVsActual data={d.plannedVsActual} progress={d.kpis.progress} />
        
        <FinanceSummary kpis={d.kpis} monthly={d.financeMonthly} />
        <CommercialPanel commercial={d.commercial} projectId={id} />

        <UpcomingDeliveries upcoming={d.upcomingDeliveries} />
        <KanbanCompact counts={d.kanbanCounts} />
        <ActivityFeed activity={d.activity} />

        {/* Secondary content as accordion */}
        <Accordion type="multiple" className="space-y-3">
          <AccordionItem value="team" className="border rounded-2xl px-4 bg-card">
            <AccordionTrigger className="py-4"><span className="flex items-center gap-2 font-semibold"><UsersIcon className="h-4 w-4" /> Equipe</span></AccordionTrigger>
            <AccordionContent><TeamSection members={d.members} projectId={id} /></AccordionContent>
          </AccordionItem>
          <AccordionItem value="risks" className="border rounded-2xl px-4 bg-card">
            <AccordionTrigger className="py-4"><span className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Riscos & Bloqueios</span></AccordionTrigger>
            <AccordionContent><RisksSection risks={d.risks} projectId={id} /></AccordionContent>
          </AccordionItem>
          <AccordionItem value="costs" className="border rounded-2xl px-4 bg-card">
            <AccordionTrigger className="py-4"><span className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4" /> Custos</span></AccordionTrigger>
            <AccordionContent><CostsSection costs={d.costs} projectId={id} /></AccordionContent>
          </AccordionItem>
          <AccordionItem value="files" className="border rounded-2xl px-4 bg-card">
            <AccordionTrigger className="py-4"><span className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> Arquivos</span></AccordionTrigger>
            <AccordionContent><FilesSection files={d.files} /></AccordionContent>
          </AccordionItem>
          <AccordionItem value="notes" className="border rounded-2xl px-4 bg-card">
            <AccordionTrigger className="py-4"><span className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> Notas & Decisões</span></AccordionTrigger>
            <AccordionContent><NotesSection notes={d.notes} projectId={id} /></AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={p} />
    </div>
  );
}

// =====================================================
// 1. Executive Header
function ExecutiveHeader({ p, d }: any) {
  return (
    <Card className="rounded-2xl p-6 border-l-4" style={{ borderLeftColor: p.color || "#6366f1" }}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="truncate text-xl sm:text-2xl font-semibold tracking-tight">{p.name}</h1>
            <Badge className={`${STATUS_TONE[p.status as ProjectStatus]} border`} variant="outline">
              {STATUS_LABEL[p.status as ProjectStatus]}
            </Badge>
            <HealthBadge health={d.health} />
            {p.commercial_model && (
              <Badge variant="outline" className="border bg-indigo-50 text-indigo-700 border-indigo-200">
                {COMMERCIAL_LABEL[p.commercial_model]}
              </Badge>
            )}
            {p.service_type && (
              <Badge variant="outline" className="border bg-slate-50 text-slate-700">
                {SERVICE_LABEL[p.service_type]}
              </Badge>
            )}
          </div>
          {p.description && <p className="text-sm text-muted-foreground mt-2 max-w-2xl line-clamp-2">{p.description}</p>}
          <div className="flex items-center gap-x-5 gap-y-1 mt-3 text-xs text-muted-foreground flex-wrap">
            {p.client && <span className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" />{p.client.name}</span>}
            <span className="flex items-center gap-1.5"><CalIcon className="h-3.5 w-3.5" />{fmtDate(p.start_date)} → {fmtDate(p.due_date)}</span>
            {d.kpis.daysRemaining !== null && (
              <span className={`flex items-center gap-1.5 ${d.kpis.daysRemaining < 0 ? "text-rose-600 font-medium" : ""}`}>
                <Clock className="h-3.5 w-3.5" />
                {d.kpis.daysRemaining < 0 ? `${Math.abs(d.kpis.daysRemaining)} dias atrasado` : `${d.kpis.daysRemaining} dias restantes`}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <QuickCreateTaskButton projectId={p.id} clientId={p.client?.id ?? null} projectName={p.name} clientName={p.client?.name ?? null} />
        </div>
      </div>
    </Card>
  );
}

function QuickCreateTaskButton({
  projectId, clientId,
}: { projectId: string; clientId: string | null; projectName?: string; clientName?: string | null }) {
  const qc = useQueryClient();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { data: inserted, error } = await supabase
        .from("tasks")
        .insert({
          owner_id: u.user.id,
          title: "Nova tarefa",
          status: "a_fazer",
          priority: "media",
          project_id: projectId,
          client_id: clientId,
          position: 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setTaskId(inserted.id as string);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Button onClick={handleCreate} disabled={creating} className="bg-[#00D084] hover:bg-[#00b873] text-white">
        <Plus className="h-4 w-4 mr-2" /> {creating ? "Criando..." : "Criar tarefa"}
      </Button>
      <TaskDrawer
        taskId={taskId}
        open={!!taskId}
        onClose={() => {
          setTaskId(null);
          qc.invalidateQueries({ queryKey: ["project-detail"] });
        }}
      />
    </>
  );
}

// 2. Alerts bar
function AlertsBar({ alerts, nextMilestone }: any) {
  const extra: any[] = [];
  if (nextMilestone) extra.push({ type: "milestone", severity: "info", message: `Próximo marco: ${nextMilestone.title}` });
  const all = [...alerts, ...extra];
  if (all.length === 0) return null;
  const icon: any = { overdue: AlertCircle, budget: DollarSign, deadline: Clock, risk: AlertTriangle, milestone: Flag };
  const tone: any = {
    danger: "bg-rose-50 border-rose-200 text-rose-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  };
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((a, i) => {
        const Icon = icon[a.type] ?? Sparkles;
        return (
          <div key={i} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${tone[a.severity]}`}>
            <Icon className="h-3.5 w-3.5 shrink-0" />{a.message}
          </div>
        );
      })}
    </div>
  );
}

// 3. KPI row
function KpiRow({ d }: any) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      <KpiTile icon={Target} label="Progresso" value={`${d.kpis.progress}%`} />
      <KpiTile icon={ListChecks} label="Tarefas" value={`${d.kpis.doneTasks}/${d.kpis.totalTasks}`} sub={d.kpis.overdueTasks > 0 ? `${d.kpis.overdueTasks} atrasadas` : ""} />
      <KpiTile icon={DollarSign} label="Receita" value={brl(d.kpis.revenueReceived)} tone="text-emerald-600" />
      <KpiTile icon={Wallet} label="Custos" value={brl(d.kpis.totalCost)} sub={`${Math.round(d.kpis.budgetUsage)}% orç.`} />
      <KpiTile icon={TrendingUp} label="Lucro" value={brl(d.kpis.profit)} sub={`${d.kpis.margin.toFixed(1)}%`} tone={d.kpis.profit >= 0 ? "text-emerald-600" : "text-rose-600"} />
      <KpiTile icon={UsersIcon} label="Equipe" value={d.kpis.memberCount} sub="membros" />
      <KpiTile icon={AlertCircle} label="Riscos" value={d.kpis.openIssues} sub="abertos" tone={d.kpis.openIssues > 0 ? "text-rose-600" : ""} />
    </div>
  );
}

// 4. Execution panel
function ExecutionPanel({ execution, onOpenTask }: { execution: { today: any[]; overdue: any[]; waitingClient: any[] }; onOpenTask: (id: string) => void }) {
  const Col = ({ title, icon: Icon, color, items, render }: any) => (
    <Card className="rounded-2xl p-4 flex flex-col min-h-[200px]">
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-7 w-7 rounded-lg grid place-items-center ${color}`}><Icon className="h-3.5 w-3.5" /></div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant="outline" className="ml-auto text-[10px]">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground my-auto text-center py-6">Nada por aqui ✨</p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 6).map((t: any) => (
            <li key={t.id}>
              <button onClick={() => onOpenTask(t.id)} className="w-full text-left p-2 rounded-lg hover:bg-muted/60 transition-colors">
                {render(t)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const today = new Date(); today.setHours(0, 0, 0, 0);
  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Central de Execução</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Col title="Fazer hoje" icon={Target} color="bg-blue-50 text-blue-600" items={execution.today}
          render={(t: any) => (
            <>
              <p className="text-sm font-medium truncate">{t.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">{t.priority ?? "—"}</p>
            </>
          )} />
        <Col title="Atrasadas" icon={AlertCircle} color="bg-rose-50 text-rose-600" items={execution.overdue}
          render={(t: any) => {
            const days = t.due_date ? Math.floor((today.getTime() - new Date(t.due_date).getTime()) / 86400000) : 0;
            return (
              <>
                <p className="text-sm font-medium truncate">{t.title}</p>
                <p className="text-[11px] text-rose-600 mt-0.5">{days} dia(s) de atraso</p>
              </>
            );
          }} />
        <Col title="Aguardando cliente" icon={UserCheck} color="bg-amber-50 text-amber-600" items={execution.waitingClient}
          render={(t: any) => (
            <>
              <p className="text-sm font-medium truncate">{t.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Solicitado: {fmtDate(t.updated_at ?? t.created_at)}</p>
            </>
          )} />
      </div>
    </div>
  );
}

// 5. Planned vs Actual
function PlannedVsActual({ data, progress }: { data: any[]; progress: number }) {
  if (!data || data.length === 0) {
    return (
      <Card className="rounded-2xl p-6">
        <h3 className="font-semibold flex items-center gap-2 mb-2"><TrendingUp className="h-4 w-4" /> Evolução do projeto</h3>
        <p className="text-sm text-muted-foreground">Defina datas de início e prazo para visualizar a evolução planejada × realizada.</p>
      </Card>
    );
  }
  const last = data[data.length - 1];
  const expected = last?.planned ?? 0;
  const delta = progress - expected;
  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Evolução do projeto</h3>
        <div className="flex items-center gap-4 text-xs">
          <span><span className="text-muted-foreground">Realizado:</span> <span className="font-semibold">{progress}%</span></span>
          <span><span className="text-muted-foreground">Previsto:</span> <span className="font-semibold">{expected}%</span></span>
          <Badge variant="outline" className={delta >= 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}>
            {delta >= 0 ? "+" : ""}{delta}%
          </Badge>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="week" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} unit="%" />
          <RTooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="planned" stroke="#94a3b8" strokeDasharray="4 4" name="Planejado" dot={false} />
          <Line type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2} name="Realizado" dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

// 6. Roadmap horizontal timeline
function RoadmapTimeline({ milestones, projectId }: { milestones: any[]; projectId: string }) {
  const qc = useQueryClient();
  const upFn = useServerFn(upsertMilestone);
  const delFn = useServerFn(deleteMilestone);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ title: "", description: "", status: "pending", due_date: "" });

  useEffect(() => {
    if (edit) setForm({ title: edit.title, description: edit.description ?? "", status: edit.status, due_date: edit.due_date ?? "" });
    else setForm({ title: "", description: "", status: "pending", due_date: "" });
  }, [edit, open]);

  const save = useMutation({
    mutationFn: () => upFn({ data: { id: edit?.id, project_id: projectId, position: milestones.length, ...form, due_date: form.due_date || null, description: form.description || null } as any }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] }); setOpen(false); setEdit(null); },
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] }),
  });
  const toggle = useMutation({
    mutationFn: (m: any) => upFn({ data: { id: m.id, project_id: projectId, title: m.title, description: m.description, status: m.status === "done" ? "pending" : "done", due_date: m.due_date, position: m.position } as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] }),
  });

  const done = milestones.filter((m) => m.status === "done").length;
  const pct = milestones.length ? Math.round((done / milestones.length) * 100) : 0;

  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2"><Flag className="h-4 w-4" /> Roadmap <span className="text-xs font-normal text-muted-foreground">· {pct}% concluído</span></h3>
        <Button size="sm" variant="outline" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-4 w-4" /> Marco</Button>
      </div>

      {milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum marco cadastrado. Clique em "Marco" para criar o primeiro.</p>
      ) : (
        <div className="overflow-x-auto pb-3">
          <div className="flex items-start gap-2 min-w-max">
            {milestones.map((m, i) => {
              const isDone = m.status === "done";
              const isProg = m.status === "in_progress";
              return (
                <div key={m.id} className="flex items-start">
                  <div className="flex flex-col items-center w-44 group">
                    <div className={`h-9 w-9 rounded-full grid place-items-center border-2 cursor-pointer transition ${
                      isDone ? "bg-emerald-500 border-emerald-500 text-white" :
                      isProg ? "bg-amber-100 border-amber-400 text-amber-700" :
                      "bg-background border-slate-300 text-slate-400"
                    }`} onClick={() => toggle.mutate(m)} title="Alternar concluído">
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : isProg ? <Hourglass className="h-4 w-4" /> : <span className="text-xs">{i + 1}</span>}
                    </div>
                    <div className="mt-2 text-center px-1">
                      <p className={`text-sm font-medium leading-tight ${isDone ? "line-through text-muted-foreground" : ""}`}>{m.title}</p>
                      {m.due_date && <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(m.due_date)}</p>}
                      <div className="flex items-center justify-center gap-0.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEdit(m); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => del.mutate(m.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  </div>
                  {i < milestones.length - 1 && (
                    <div className={`h-0.5 w-8 mt-[18px] ${isDone ? "bg-emerald-400" : "bg-slate-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit ? "Editar marco" : "Novo marco"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="in_progress">Em andamento</SelectItem>
                    <SelectItem value="done">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Data</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.title}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// 7. Finance summary with sparkline
function FinanceSummary({ kpis, monthly }: { kpis: any; monthly: any[] }) {
  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2"><DollarSign className="h-4 w-4" /> Resumo financeiro</h3>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiTile icon={Briefcase} label="Contrato" value={brl(kpis.contractValue)} />
        <KpiTile icon={DollarSign} label="Recebido" value={brl(kpis.revenueReceived)} tone="text-emerald-600" />
        <KpiTile icon={Wallet} label="Custos" value={brl(kpis.totalCost)} />
        <KpiTile icon={TrendingUp} label="Lucro" value={brl(kpis.profit)} tone={kpis.profit >= 0 ? "text-emerald-600" : "text-rose-600"} />
        <KpiTile icon={Sparkles} label="Margem" value={`${kpis.margin.toFixed(1)}%`} tone={kpis.margin >= 0 ? "text-emerald-600" : "text-rose-600"} />
      </div>
      {monthly && monthly.length > 0 && (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={monthly}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis hide />
              <RTooltip formatter={(v: any) => brl(Number(v))} />
              <Bar dataKey="revenue" fill="#10b981" radius={[6, 6, 0, 0]} name="Receita" />
              <Bar dataKey="cost" fill="#f43f5e" radius={[6, 6, 0, 0]} name="Custo" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

// 8. Upcoming deliveries
function UpcomingDeliveries({ upcoming }: { upcoming: { in7: any[]; in15: any[]; in30: any[] } }) {
  const groups = [
    { label: "Próximos 7 dias", items: upcoming.in7, tone: "text-rose-600 bg-rose-50" },
    { label: "Próximos 15 dias", items: upcoming.in15.filter((x) => !upcoming.in7.find((y) => y.id === x.id)), tone: "text-amber-600 bg-amber-50" },
    { label: "Próximos 30 dias", items: upcoming.in30.filter((x) => !upcoming.in15.find((y) => y.id === x.id)), tone: "text-blue-600 bg-blue-50" },
  ];
  const total = upcoming.in30.length;
  return (
    <Card className="rounded-2xl p-6">
      <h3 className="font-semibold flex items-center gap-2 mb-4"><CalIcon className="h-4 w-4" /> Próximas entregas</h3>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma entrega prevista nos próximos 30 dias.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => g.items.length > 0 && (
            <div key={g.label}>
              <p className={`inline-block text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${g.tone} mb-2`}>{g.label}</p>
              <ul className="space-y-1.5">
                {g.items.map((it) => (
                  <li key={`${it.kind}-${it.id}`} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                    <span className="flex items-center gap-2 truncate"><span className="text-base">{it.kind === "milestone" ? "🎯" : "📋"}</span><span className="truncate">{it.title}</span></span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{fmtDate(it.due_date)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// 9. Kanban compact
function KanbanCompact({ counts }: { counts: Record<string, number> }) {
  const order = ["a_fazer", "em_andamento", "em_revisao", "concluido"];
  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2"><ListChecks className="h-4 w-4" /> Kanban</h3>
        <Button size="sm" variant="ghost" asChild><Link to="/tarefas" search={{ task: undefined }}>Abrir tarefas <ArrowRight className="h-3 w-3" /></Link></Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {order.map((k) => (
          <Link key={k} to="/tarefas" search={{ task: undefined }} className="rounded-xl border bg-muted/30 hover:bg-muted/60 transition-colors p-4 text-center">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{KANBAN_LABEL[k]}</p>
            <p className="text-2xl font-semibold mt-1">{counts[k] ?? 0}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// 10. Activity feed
function ActivityFeed({ activity }: { activity: any[] }) {
  return (
    <Card className="rounded-2xl p-6">
      <h3 className="font-semibold flex items-center gap-2 mb-4"><ActivityIcon className="h-4 w-4" /> Atividade recente</h3>
      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem atividade registrada ainda.</p>
      ) : (
        <ul className="space-y-3">
          {activity.slice(0, 12).map((a) => {
            const initials = (a.actor_name ?? "?").slice(0, 2).toUpperCase();
            return (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold">{initials}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm"><span className="font-medium">{a.actor_name ?? "Sistema"}</span> <span className="text-muted-foreground">{a.action}</span></p>
                  <p className="text-[11px] text-muted-foreground">{relativeTime(a.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// 11. Context sidebar (sticky on desktop)
function ContextSidebar({ p, d }: any) {
  const riskLabel = d.kpis.openIssues === 0 ? { l: "Baixo", c: "text-emerald-600" } :
    d.kpis.openIssues < 3 ? { l: "Médio", c: "text-amber-600" } : { l: "Alto", c: "text-rose-600" };
  const nextDelivery = d.upcomingDeliveries.in30[0];
  return (
    <aside className="lg:sticky lg:top-4 lg:self-start space-y-3">
      <Card className="rounded-2xl p-4">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Projeto</p>
        <p className="font-semibold mt-1 truncate">{p.name}</p>
        <Badge className={`${STATUS_TONE[p.status as ProjectStatus]} border mt-2`} variant="outline">{STATUS_LABEL[p.status as ProjectStatus]}</Badge>
      </Card>
      <Card className="rounded-2xl p-4 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Saúde</span>
          <HealthBadge health={d.health} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Cliente</span>
          <span className="font-medium truncate ml-2">{p.client?.name ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Prazo</span>
          <span className="font-medium">{fmtDate(p.due_date)}</span>
        </div>
        {d.kpis.daysRemaining !== null && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">Dias restantes</span>
            <span className={`font-medium ${d.kpis.daysRemaining < 0 ? "text-rose-600" : ""}`}>{d.kpis.daysRemaining}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Equipe</span>
          <span className="font-medium">{d.kpis.memberCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Risco</span>
          <span className={`font-medium ${riskLabel.c}`}>{riskLabel.l}</span>
        </div>
      </Card>
      {d.nextMilestone && (
        <Card className="rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1"><Flag className="h-3 w-3" /> Próximo marco</p>
          <p className="font-medium text-sm mt-1.5">{d.nextMilestone.title}</p>
          {d.nextMilestone.due_date && <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(d.nextMilestone.due_date)}</p>}
        </Card>
      )}
      {nextDelivery && (
        <Card className="rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1"><CalIcon className="h-3 w-3" /> Próxima entrega</p>
          <p className="font-medium text-sm mt-1.5 truncate">{nextDelivery.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(nextDelivery.due_date)}</p>
        </Card>
      )}
    </aside>
  );
}

// =====================================================
// Secondary sections (accordion content)

function TeamSection({ members, projectId }: { members: any[]; projectId: string }) {
  const qc = useQueryClient();
  const upFn = useServerFn(upsertMember);
  const delFn = useServerFn(deleteMember);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", email: "" });

  const save = useMutation({
    mutationFn: () => upFn({ data: { project_id: projectId, name: form.name, role: form.role || null, email: form.email || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] }); setOpen(false); setForm({ name: "", role: "", email: "" }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] }),
  });

  return (
    <div className="pb-4">
      <div className="flex justify-end mb-3"><Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Membro</Button></div>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum membro alocado.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">{m.name.slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{m.name}</p>
                <p className="text-xs text-muted-foreground truncate">{m.role || m.email || "—"}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => del.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo membro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Papel</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Designer, Dev..." /></div>
            <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.name}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RisksSection({ risks, projectId }: { risks: any[]; projectId: string }) {
  const qc = useQueryClient();
  const upFn = useServerFn(upsertRisk);
  const delFn = useServerFn(deleteRisk);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ title: "", description: "", severity: "medium", status: "open" });

  useEffect(() => {
    if (edit) setForm({ title: edit.title, description: edit.description ?? "", severity: edit.severity, status: edit.status });
    else setForm({ title: "", description: "", severity: "medium", status: "open" });
  }, [edit, open]);

  const save = useMutation({
    mutationFn: () => upFn({ data: { id: edit?.id, project_id: projectId, title: form.title, description: form.description || null, severity: form.severity as any, status: form.status as any } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] }); setOpen(false); setEdit(null); },
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] }),
  });

  const sevTone: Record<string, string> = {
    low: "bg-slate-100 text-slate-700", medium: "bg-amber-50 text-amber-700",
    high: "bg-orange-50 text-orange-700", critical: "bg-rose-100 text-rose-800 border-rose-300",
  };

  return (
    <div className="pb-4">
      <div className="flex justify-end mb-3"><Button size="sm" variant="outline" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-4 w-4" /> Risco</Button></div>
      {risks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum risco registrado.</p>
      ) : (
        <ul className="space-y-2">
          {risks.map((r) => (
            <li key={r.id} className={`p-3 rounded-xl border ${r.severity === "critical" ? "border-rose-300 bg-rose-50" : "border-border bg-muted/30"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{r.title}</p>
                    <Badge variant="outline" className={`${sevTone[r.severity]} border-0 text-xs`}>{r.severity}</Badge>
                    <Badge variant="outline" className="text-xs">{r.status}</Badge>
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mt-1">{r.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEdit(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit ? "Editar risco" : "Novo risco"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Severidade</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem><SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem><SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Aberto</SelectItem><SelectItem value="mitigated">Mitigado</SelectItem>
                    <SelectItem value="resolved">Resolvido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.title}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CostsSection({ costs, projectId }: { costs: any[]; projectId: string }) {
  const qc = useQueryClient();
  const upFn = useServerFn(upsertCost);
  const delFn = useServerFn(deleteCost);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: "internal", category: "", description: "", amount: "", incurred_at: new Date().toISOString().slice(0, 10) });

  const save = useMutation({
    mutationFn: () => upFn({ data: { project_id: projectId, kind: form.kind as "internal" | "external", category: form.category || null, description: form.description || null, amount: Number(form.amount), incurred_at: form.incurred_at } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] }); setOpen(false); setForm({ kind: "internal", category: "", description: "", amount: "", incurred_at: new Date().toISOString().slice(0, 10) }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] }),
  });

  return (
    <div className="pb-4">
      <div className="flex justify-end mb-3"><Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Custo</Button></div>
      {costs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum custo lançado.</p>
      ) : (
        <ul className="divide-y">
          {costs.map((c: any) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium">{c.description || c.category || "(sem descrição)"}</p>
                <p className="text-xs text-muted-foreground">{c.kind === "internal" ? "Interno" : "Externo"} · {c.category || "—"} · {fmtDate(c.incurred_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{brl(Number(c.amount))}</span>
                <Button size="sm" variant="ghost" onClick={() => del.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo custo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Interno</SelectItem><SelectItem value="external">Externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Valor</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            </div>
            <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Data</Label><Input type="date" value={form.incurred_at} onChange={(e) => setForm({ ...form, incurred_at: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!form.amount}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilesSection({ files }: { files: any[] }) {
  return (
    <div className="pb-4">
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum arquivo. Use o módulo Arquivos para fazer upload.</p>
      ) : (
        <ul className="divide-y">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.category} · {fmtDate(f.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesSection({ notes, projectId }: { notes: any; projectId: string }) {
  const saveFn = useServerFn(saveProjectNotes);
  const [html, setHtml] = useState(notes?.content_html ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(notes ? new Date(notes.updated_at) : null);

  // Carrega o conteúdo apenas na primeira vez que `notes` chega — evita sobrescrever o que o usuário está digitando quando a query refaz fetch.
  useEffect(() => {
    if (notes?.content_html != null && html === "") setHtml(notes.content_html);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes?.id]);

  useEffect(() => {
    if (html === (notes?.content_html ?? "")) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await saveFn({ data: { project_id: projectId, content_html: html } });
        setSavedAt(new Date());
      } finally { setSaving(false); }
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  return (
    <div className="pb-4">
      <div className="flex items-center justify-end mb-2">
        <span className="text-xs text-muted-foreground">{saving ? "Salvando..." : savedAt ? `Salvo às ${savedAt.toLocaleTimeString("pt-BR")}` : ""}</span>
      </div>
      <RichTextEditor value={html} onChange={setHtml} placeholder="Reuniões, decisões, observações..." minHeight={240} />
    </div>
  );
}

// =====================================================
// Commercial Panel
function CommercialPanel({ commercial, projectId }: { commercial: any; projectId: string }) {
  const qc = useQueryClient();
  const genFn = useServerFn(generateRecurringInvoice);
  const gen = useMutation({
    mutationFn: () => genFn({ data: { project_id: projectId } }),
    onSuccess: () => {
      toast.success("Cobrança gerada");
      qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  if (!commercial) return null;
  const c = commercial;
  const model = c.model as string;

  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4" /> Comercial
          <span className="text-xs font-normal text-muted-foreground">· {COMMERCIAL_LABEL[model] ?? model}</span>
          {c.serviceType && <span className="text-xs font-normal text-muted-foreground">· {SERVICE_LABEL[c.serviceType] ?? c.serviceType}</span>}
        </h3>
        {(model === "mensal_recorrente" || model === "suporte_continuo") && (
          <Button size="sm" variant="outline" onClick={() => gen.mutate()} disabled={gen.isPending}>
            <Plus className="h-4 w-4" /> Gerar próxima cobrança
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiTile icon={DollarSign} label="Receita" value={brl(c.revenue)} tone="text-emerald-600" />
        <KpiTile icon={Wallet} label="Custos" value={brl(c.costs)} />
        <KpiTile icon={TrendingUp} label="Lucro" value={brl(c.profit)} tone={c.profit >= 0 ? "text-emerald-600" : "text-rose-600"} />
        <KpiTile icon={Sparkles} label="Margem" value={`${c.margin.toFixed(1)}%`} tone={c.margin >= 0 ? "text-emerald-600" : "text-rose-600"} />
      </div>

      {model === "projeto_fechado" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiTile icon={Briefcase} label="Contratado" value={brl(c.contractValue)} />
          <KpiTile icon={DollarSign} label="Recebido" value={brl(c.revenue)} tone="text-emerald-600" />
          <KpiTile icon={Clock} label="Pendente" value={brl(c.pending)} tone="text-amber-600" />
        </div>
      )}

      {(model === "mensal_recorrente" || model === "suporte_continuo") && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile icon={DollarSign} label="Valor mensal" value={brl(c.monthlyValue)} />
          <KpiTile icon={CalIcon} label="Próxima cobrança" value={fmtDate(c.nextBilling)} />
          <KpiTile icon={CheckCircle2} label="Meses pagos" value={c.monthsPaid} tone="text-emerald-600" />
          <KpiTile icon={AlertCircle} label="Meses pendentes" value={c.monthsPending} tone={c.monthsPending > 0 ? "text-amber-600" : ""} />
        </div>
      )}

      {model === "por_hora" && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiTile icon={Clock} label="Valor/hora" value={brl(c.hourlyRate)} />
          <KpiTile icon={Hourglass} label="Horas registradas" value={`${c.hoursWorked}h`} />
          <KpiTile icon={TrendingUp} label="Receita gerada" value={brl(c.billableValue)} tone="text-emerald-600" />
        </div>
      )}

      {model === "banco_horas" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile icon={Briefcase} label="Contratadas" value={`${c.hoursContracted}h`} />
            <KpiTile icon={Hourglass} label="Utilizadas" value={`${c.hoursWorked}h`} />
            <KpiTile icon={CheckCircle2} label="Restantes" value={`${c.hoursRemaining}h`} tone={c.hoursRemaining <= 0 ? "text-rose-600" : "text-emerald-600"} />
            <KpiTile icon={DollarSign} label="Valor/hora" value={brl(c.hourlyRate)} />
          </div>
          {c.hoursContracted > 0 && (
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Consumo do banco</span>
                <span className="font-semibold">{Math.min(100, Math.round((c.hoursWorked / c.hoursContracted) * 100))}%</span>
              </div>
              <Progress value={Math.min(100, (c.hoursWorked / c.hoursContracted) * 100)} className="h-2" />
            </div>
          )}
        </div>
      )}

      <ProjectCommercialTable projectId={projectId} />
    </Card>
  );
}
