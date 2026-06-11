import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  getProjectDashboard, upsertMilestone, deleteMilestone,
  upsertMember, deleteMember, upsertRisk, deleteRisk,
  upsertCost, deleteCost, saveProjectNotes, deleteProject,
  type ProjectStatus,
} from "@/lib/projects/projects.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Plus, Pencil, Trash2, AlertTriangle, CheckCircle2, Clock,
  TrendingUp, DollarSign, Users as UsersIcon, Calendar as CalIcon, AlertCircle,
  Activity as ActivityIcon, FileText, Target, Briefcase,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  Tooltip as RTooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { RichTextEditor } from "@/components/tasks/RichTextEditor";
import { toast } from "sonner";

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

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

function KpiCard({ icon: Icon, label, value, sub, tone = "" }: any) {
  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-semibold mt-1 ${tone}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="rounded-xl bg-muted/60 p-2"><Icon className="h-4 w-4 text-muted-foreground" /></div>
      </div>
    </Card>
  );
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

function ProjectCommandCenter() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
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

  const d = dashQ.data;
  const p: any = d.project;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
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

      {/* Header */}
      <Card className="rounded-2xl p-6 border-l-4" style={{ borderLeftColor: p.color || "#6366f1" }}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{p.name}</h1>
              <Badge className={`${STATUS_TONE[p.status as ProjectStatus]} border`} variant="outline">
                {STATUS_LABEL[p.status as ProjectStatus]}
              </Badge>
              <HealthBadge health={d.health} />
            </div>
            {p.description && <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{p.description}</p>}
            <div className="flex items-center gap-6 mt-4 text-sm text-muted-foreground flex-wrap">
              {p.client && <span className="flex items-center gap-1.5"><Briefcase className="h-4 w-4" />{p.client.name}</span>}
              <span className="flex items-center gap-1.5"><CalIcon className="h-4 w-4" />
                {p.start_date ? new Date(p.start_date).toLocaleDateString("pt-BR") : "—"} →{" "}
                {p.due_date ? new Date(p.due_date).toLocaleDateString("pt-BR") : "—"}
              </span>
              {d.kpis.daysRemaining !== null && (
                <span className={d.kpis.daysRemaining < 0 ? "text-rose-600" : ""}>
                  <Clock className="h-4 w-4 inline mr-1" />
                  {d.kpis.daysRemaining < 0 ? `${Math.abs(d.kpis.daysRemaining)} dias atrasado` : `${d.kpis.daysRemaining} dias restantes`}
                </span>
              )}
            </div>
          </div>
          <div className="md:w-72 shrink-0">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">Progresso</span>
              <span className="font-semibold">{d.kpis.progress}%</span>
            </div>
            <Progress value={d.kpis.progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {d.kpis.doneTasks} de {d.kpis.totalTasks} tarefas concluídas
            </p>
          </div>
        </div>
      </Card>

      {/* Alerts */}
      {d.alerts.length > 0 && (
        <div className="space-y-2">
          {d.alerts.map((a, i) => (
            <Card key={i} className={`rounded-2xl p-4 border flex items-center gap-3 ${
              a.severity === "danger" ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-amber-50 border-amber-200 text-amber-800"
            }`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">{a.message}</span>
            </Card>
          ))}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <KpiCard icon={Target} label="Progresso" value={`${d.kpis.progress}%`} sub={`${d.kpis.doneTasks}/${d.kpis.totalTasks} tarefas`} />
        <KpiCard icon={DollarSign} label="Receita" value={brl(d.kpis.revenueReceived)} sub={`${brl(d.kpis.revenuePending)} pendente`} />
        <KpiCard icon={TrendingUp} label="Custo" value={brl(d.kpis.totalCost)} sub={`${Math.round(d.kpis.budgetUsage)}% do orçamento`} />
        <KpiCard icon={DollarSign} label="Lucro" value={brl(d.kpis.profit)}
          sub={`${d.kpis.margin.toFixed(1)}% margem`}
          tone={d.kpis.profit >= 0 ? "text-emerald-600" : "text-rose-600"} />
        <KpiCard icon={UsersIcon} label="Equipe" value={d.kpis.memberCount} sub="membros" />
        <KpiCard icon={AlertCircle} label="Issues" value={d.kpis.openIssues} sub="riscos abertos"
          tone={d.kpis.openIssues > 0 ? "text-rose-600" : ""} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="tasks">Tarefas</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
          <TabsTrigger value="team">Equipe</TabsTrigger>
          <TabsTrigger value="files">Arquivos</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
          <TabsTrigger value="risks">Riscos</TabsTrigger>
          <TabsTrigger value="activity">Atividade</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <TodayFocus tasks={d.todayTasks} />
          <WeeklyPerformance weekly={d.weekly} />
          <MonthlyChart days={d.chartDays} />
          <MilestonesSection milestones={d.milestones} tasks={d.tasks} projectId={id} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <Card className="rounded-2xl p-6 text-center">
            <p className="text-muted-foreground mb-3">Gerencie tarefas deste projeto na página principal de tarefas.</p>
            <Button asChild><Link to="/tarefas">Abrir Tarefas →</Link></Button>
            <div className="mt-6 text-left">
              <p className="text-sm font-medium mb-2">Tarefas vinculadas ({d.tasks.length})</p>
              <ul className="space-y-1.5">
                {d.tasks.slice(0, 20).map((t: any) => (
                  <li key={t.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                    <span className="truncate">{t.title}</span>
                    <Badge variant="outline" className="text-xs">{t.status}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-6 mt-6">
          <FinancialSection kpis={d.kpis} finances={d.finances} costs={d.costs} projectId={id} />
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamSection members={d.members} projectId={id} />
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <FilesSection files={d.files} />
        </TabsContent>

        <TabsContent value="notes" className="mt-6">
          <NotesSection notes={d.notes} projectId={id} />
        </TabsContent>

        <TabsContent value="risks" className="mt-6">
          <RisksSection risks={d.risks} projectId={id} />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <ActivitySection activity={d.activity} />
        </TabsContent>
      </Tabs>

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={p} />
    </div>
  );
}

// ---------- Sub-sections ----------

function TodayFocus({ tasks }: { tasks: any[] }) {
  return (
    <Card className="rounded-2xl p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2"><Target className="h-4 w-4" /> Foco do dia</h3>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma tarefa para hoje.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.priority} · {t.status}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function WeeklyPerformance({ weekly }: { weekly: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="rounded-2xl p-5">
        <div className="flex items-center gap-2 text-emerald-700 mb-2">
          <CheckCircle2 className="h-4 w-4" />
          <p className="text-xs uppercase tracking-wide font-semibold">Concluídas esta semana</p>
        </div>
        <p className="text-3xl font-semibold">{weekly.completed.length}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {weekly.completed.slice(0, 5).map((t: any) => (
            <li key={t.id} className="truncate text-muted-foreground">• {t.title}</li>
          ))}
        </ul>
      </Card>
      <Card className="rounded-2xl p-5">
        <div className="flex items-center gap-2 text-rose-700 mb-2">
          <AlertCircle className="h-4 w-4" />
          <p className="text-xs uppercase tracking-wide font-semibold">Atrasadas</p>
        </div>
        <p className="text-3xl font-semibold">{weekly.overdue.length}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {weekly.overdue.slice(0, 5).map((t: any) => (
            <li key={t.id} className="truncate text-muted-foreground">• {t.title}</li>
          ))}
        </ul>
      </Card>
      <Card className="rounded-2xl p-5">
        <div className="flex items-center gap-2 text-blue-700 mb-2">
          <Plus className="h-4 w-4" />
          <p className="text-xs uppercase tracking-wide font-semibold">Novas esta semana</p>
        </div>
        <p className="text-3xl font-semibold">{weekly.created.length}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {weekly.created.slice(0, 5).map((t: any) => (
            <li key={t.id} className="truncate text-muted-foreground">• {t.title}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function MonthlyChart({ days }: { days: any[] }) {
  return (
    <Card className="rounded-2xl p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Últimos 30 dias</h3>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={days}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
          <YAxis tick={{ fontSize: 10 }} />
          <RTooltip />
          <Area type="monotone" dataKey="created" stroke="#6366f1" fill="#6366f120" name="Criadas" />
          <Area type="monotone" dataKey="completed" stroke="#10b981" fill="#10b98120" name="Concluídas" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

function MilestonesSection({ milestones, projectId }: { milestones: any[]; projectId: string }) {
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

  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2"><Target className="h-4 w-4" /> Roadmap</h3>
        <Button size="sm" variant="outline" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-4 w-4" /> Marco</Button>
      </div>
      {milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem marcos cadastrados.</p>
      ) : (
        <ol className="relative border-l-2 border-muted pl-6 space-y-4">
          {milestones.map((m) => (
            <li key={m.id} className="relative">
              <span className={`absolute -left-[33px] h-5 w-5 rounded-full border-2 ${
                m.status === "done" ? "bg-emerald-500 border-emerald-500" :
                m.status === "in_progress" ? "bg-amber-400 border-amber-400" : "bg-background border-muted-foreground"
              }`} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`font-medium ${m.status === "done" ? "line-through text-muted-foreground" : ""}`}>{m.title}</p>
                  {m.description && <p className="text-sm text-muted-foreground mt-0.5">{m.description}</p>}
                  {m.due_date && <p className="text-xs text-muted-foreground mt-1">📅 {new Date(m.due_date).toLocaleDateString("pt-BR")}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => toggle.mutate(m)}><CheckCircle2 className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEdit(m); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
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

function FinancialSection({ kpis, finances, costs, projectId }: any) {
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

  const byKind = useMemo(() => {
    const m = { internal: 0, external: 0 };
    costs.forEach((c: any) => { m[c.kind as "internal" | "external"] += Number(c.amount); });
    return [{ name: "Interno", value: m.internal }, { name: "Externo", value: m.external }];
  }, [costs]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Contrato" value={brl(kpis.contractValue)} />
        <KpiCard icon={DollarSign} label="Recebido" value={brl(kpis.revenueReceived)} tone="text-emerald-600" />
        <KpiCard icon={DollarSign} label="Pendente" value={brl(kpis.revenuePending)} tone="text-amber-600" />
        <KpiCard icon={DollarSign} label="Margem" value={`${kpis.margin.toFixed(1)}%`}
          tone={kpis.margin >= 0 ? "text-emerald-600" : "text-rose-600"} />
      </div>

      <Card className="rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Custos por tipo</h3>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byKind}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <RTooltip formatter={(v: any) => brl(Number(v))} />
            <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Custos lançados</h3>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Custo</Button>
        </div>
        {costs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum custo lançado.</p>
        ) : (
          <ul className="divide-y">
            {costs.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">{c.description || c.category || "(sem descrição)"}</p>
                  <p className="text-xs text-muted-foreground">{c.kind === "internal" ? "Interno" : "Externo"} · {c.category || "—"} · {new Date(c.incurred_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{brl(Number(c.amount))}</span>
                  <Button size="sm" variant="ghost" onClick={() => del.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
                    <SelectItem value="internal">Interno</SelectItem>
                    <SelectItem value="external">Externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Valor</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            </div>
            <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Design, Hospedagem..." /></div>
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
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2"><UsersIcon className="h-4 w-4" /> Equipe</h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Membro</Button>
      </div>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum membro alocado.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                {m.name.slice(0, 2).toUpperCase()}
              </div>
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
    </Card>
  );
}

function FilesSection({ files }: { files: any[] }) {
  return (
    <Card className="rounded-2xl p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2"><FileText className="h-4 w-4" /> Arquivos</h3>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum arquivo. Use o módulo Arquivos para fazer upload.</p>
      ) : (
        <ul className="divide-y">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.category} · {new Date(f.created_at).toLocaleDateString("pt-BR")}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NotesSection({ notes, projectId }: { notes: any; projectId: string }) {
  const saveFn = useServerFn(saveProjectNotes);
  const [html, setHtml] = useState(notes?.content_html ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(notes ? new Date(notes.updated_at) : null);

  useEffect(() => {
    setHtml(notes?.content_html ?? "");
  }, [notes?.content_html]);

  useEffect(() => {
    if (html === (notes?.content_html ?? "")) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await saveFn({ data: { project_id: projectId, content_html: html } });
        setSavedAt(new Date());
      } finally {
        setSaving(false);
      }
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Notas & decisões</h3>
        <span className="text-xs text-muted-foreground">
          {saving ? "Salvando..." : savedAt ? `Salvo às ${savedAt.toLocaleTimeString("pt-BR")}` : ""}
        </span>
      </div>
      <RichTextEditor value={html} onChange={setHtml} placeholder="Reuniões, decisões, observações..." minHeight={240} />
    </Card>
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
    low: "bg-slate-100 text-slate-700",
    medium: "bg-amber-50 text-amber-700",
    high: "bg-orange-50 text-orange-700",
    critical: "bg-rose-100 text-rose-800 border-rose-300",
  };

  return (
    <Card className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Riscos & bloqueios</h3>
        <Button size="sm" variant="outline" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-4 w-4" /> Risco</Button>
      </div>
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
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="mitigated">Mitigado</SelectItem>
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
    </Card>
  );
}

function ActivitySection({ activity }: { activity: any[] }) {
  return (
    <Card className="rounded-2xl p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2"><ActivityIcon className="h-4 w-4" /> Atividade recente</h3>
      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem atividade registrada ainda.</p>
      ) : (
        <ul className="space-y-3">
          {activity.map((a) => (
            <li key={a.id} className="flex items-start gap-3 text-sm">
              <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">{a.action}</p>
                <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
