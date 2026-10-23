import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, FolderKanban, Calendar as CalIcon, Users, Plus } from "lucide-react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SalesDashboard } from "@/components/dashboard/SalesDashboard";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { scopeOrganization } from "@/lib/org/filter";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Hublynx Core" }] }),
  component: Dashboard,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{(error as Error).message}</div>,
  notFoundComponent: () => <div className="p-6">Não encontrado.</div>,
});

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString(), startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function Dashboard() {
  const qc = useQueryClient();
  const org = useOrgAccess();
  const today = todayRange();

  const { data: me } = useQuery({
    queryKey: ["me-dash"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", u.user!.id).maybeSingle();
      return p?.full_name?.split(" ")[0] ?? "por aí";
    },
  });

  // KPIs + lists in one shot — always scoped to the active organization.
  const orgId = org.activeOrg?.id ?? null;
  const { data } = useQuery({
    queryKey: ["dashboard-data", orgId],
    enabled: !org.isLoading,
    queryFn: async () => {
      const sb = supabase as any;
      const OPEN_TASK = "(concluido,cancelado)";
      const CLOSED_PROJECT = "(concluido,cancelado)";
      const [
        tasksToday, tasksOverdue,
        projectsActive, projectsOverdue,
        eventsToday, meetingsToday, leadMeetingsToday,
        clientsActive, clientsTotal,
        tasksTodayList, projectsList, eventsList,
      ] = await Promise.all([
        scopeOrganization(sb.from("tasks").select("id", { count: "exact", head: true })
          .gte("due_date", today.start).lte("due_date", today.end).not("status", "in", OPEN_TASK), orgId),
        scopeOrganization(sb.from("tasks").select("id", { count: "exact", head: true })
          .lt("due_date", today.start).not("status", "in", OPEN_TASK), orgId),
        scopeOrganization(sb.from("projects").select("id", { count: "exact", head: true })
          .not("status", "in", CLOSED_PROJECT), orgId),
        scopeOrganization(sb.from("projects").select("id", { count: "exact", head: true })
          .lt("due_date", today.startDate).not("status", "in", CLOSED_PROJECT), orgId),
        scopeOrganization(sb.from("events").select("id,start_at")
          .gte("start_at", today.start).lte("start_at", today.end), orgId),
        scopeOrganization(sb.from("task_communications").select("id,start_at")
          .eq("kind", "meeting").gte("start_at", today.start).lte("start_at", today.end), orgId),
        sb.from("lead_tasks").select("id,due_at,leads!inner(organization_id)")
          .eq("done", false).in("kind", ["reuniao", "call"])
          .gte("due_at", today.start).lte("due_at", today.end)
          .then((r: any) => orgId ? { ...r, data: (r.data ?? []).filter((x: any) => x.leads?.organization_id === orgId) } : r),
        scopeOrganization(sb.from("clients").select("id", { count: "exact", head: true }).eq("status", "ativo"), orgId),
        scopeOrganization(sb.from("clients").select("id", { count: "exact", head: true }), orgId),
        scopeOrganization(sb.from("tasks")
          .select("id,title,priority,status,due_date,project_id,client_id,projects(name),clients(name)")
          .gte("due_date", today.start).lte("due_date", today.end).neq("status", "cancelado"), orgId)
          .order("due_date").limit(6),
        scopeOrganization(sb.from("projects")
          .select("id,name,color,clients(name)")
          .not("status", "in", CLOSED_PROJECT), orgId)
          .order("updated_at", { ascending: false }).limit(5),
        scopeOrganization(sb.from("events")
          .select("id,title,start_at,end_at,event_type")
          .gte("start_at", today.start), orgId)
          .order("start_at").limit(4),
      ]);

      // Project progress follows completed stages (same rule as the project cards).
      const projects = (projectsList.data ?? []) as any[];
      const progress: Record<string, number> = {};
      if (projects.length) {
        const { data: stages } = await sb.from("project_stages")
          .select("project_id,status").in("project_id", projects.map((p) => p.id));
        const acc: Record<string, { t: number; d: number }> = {};
        for (const s of stages ?? []) {
          const a = (acc[s.project_id] ??= { t: 0, d: 0 });
          a.t += 1; if (s.status === "done") a.d += 1;
        }
        for (const [pid, a] of Object.entries(acc)) progress[pid] = a.t ? Math.round((a.d / a.t) * 100) : 0;
      }

      const now = new Date();
      const starts = [
        ...(eventsToday.data ?? []).map((e: any) => e.start_at),
        ...(meetingsToday.data ?? []).map((e: any) => e.start_at),
        ...(leadMeetingsToday.data ?? []).map((e: any) => e.due_at),
      ].filter(Boolean).sort();
      const next = starts.find((s: string) => new Date(s) >= now);

      return {
        kpi: {
          tasksToday: tasksToday.count ?? 0,
          tasksOverdue: tasksOverdue.count ?? 0,
          projectsActive: projectsActive.count ?? 0,
          projectsOverdue: projectsOverdue.count ?? 0,
          eventsToday: starts.length,
          nextEventTime: next ? fmtTime(next) : null,
          clientsActive: clientsActive.count ?? 0,
          clientsTotal: clientsTotal.count ?? 0,
        },
        tasks: tasksTodayList.data ?? [],
        projects: projects.map((p) => ({ ...p, progress: progress[p.id] ?? 0 })),
        events: eventsList.data ?? [],
      };
    },
  });

  const completeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks")
        .update({ status: "concluido", completed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard-data"] }),
  });

  const k = data?.kpi;
  const KPI = [
    { title: "Tarefas para hoje", value: k?.tasksToday ?? 0,
      sub: k?.tasksOverdue ? `${k.tasksOverdue} em atraso` : "Sem atrasos",
      subTone: k?.tasksOverdue ? "text-destructive" : "text-muted-foreground",
      icon: CheckSquare, color: "bg-primary/10 text-primary" },
    { title: "Projetos ativos", value: k?.projectsActive ?? 0,
      sub: k?.projectsOverdue ? `${k.projectsOverdue} em atraso` : "Em dia",
      subTone: k?.projectsOverdue ? "text-destructive" : "text-muted-foreground",
      icon: FolderKanban, color: "bg-success/10 text-success" },
    { title: "Reuniões hoje", value: k?.eventsToday ?? 0,
      sub: k?.nextEventTime ? `Próxima: ${k.nextEventTime}` : "Sem reuniões",
      subTone: "text-muted-foreground", icon: CalIcon, color: "bg-warning/15 text-warning-foreground" },
    { title: "Clientes ativos", value: k?.clientsActive ?? 0,
      sub: "—", subTone: "text-muted-foreground", icon: Users, color: "bg-primary/10 text-primary" },
  ];

  return (
    <div className="space-y-8 sm:space-y-10">
      {!org.isLoading && org.hasModule("crm") ? (
        <SalesDashboard />
      ) : (
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{greeting()}, {me ?? "por aí"}</h1>
          <p className="text-sm text-muted-foreground">Visão geral da operação.</p>
        </div>
      )}

      <section className="space-y-4 sm:space-y-6">
      <h2 className="text-lg font-extrabold tracking-tight sm:text-xl">Seu dia, {me ?? "por aí"}</h2>
      <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
        {KPI.map((kp) => {
          const Icon = kp.icon;
          return (
            <Card key={kp.title} className="border-border/60 shadow-[var(--shadow-soft)]">
              <CardContent className="p-3 sm:p-5">
                <div className="flex items-center justify-between gap-2 sm:block">
                  <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg ${kp.color} flex items-center justify-center shrink-0`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <p className="text-xl font-semibold tabular-nums sm:hidden">{kp.value}</p>
                </div>
                <p className="mt-2 text-xs leading-tight text-muted-foreground sm:mt-4 sm:text-sm">{kp.title}</p>
                <p className="mt-1 hidden text-2xl font-semibold tabular-nums sm:block">{kp.value}</p>
                <p className={`mt-1 truncate text-[11px] sm:text-xs ${kp.subTone}`}>{kp.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Tarefas do dia */}
        <Card className="shadow-[var(--shadow-soft)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 sm:p-6">
            <CardTitle className="text-base">Tarefas do dia</CardTitle>
            <Button asChild variant="outline" size="sm"><Link to="/tarefas" search={{ task: undefined }}>Ver todas</Link></Button>
          </CardHeader>
          <CardContent className="space-y-1 px-4 pb-4 sm:px-6 sm:pb-6">
            {data?.tasks.length === 0 && (
              <EmptyState icon={CheckSquare} text="Nenhuma tarefa para hoje" cta="Criar tarefa" to="/tarefas" />
            )}
            {data?.tasks.map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 py-2">
                <div className={`w-1 h-10 rounded-full ${
                  t.priority === "alta" ? "bg-destructive" :
                  t.priority === "media" ? "bg-warning" : "bg-success"}`} />
                <Checkbox checked={t.status === "concluido"}
                  onCheckedChange={() => completeMut.mutate(t.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[t.clients?.name, t.projects?.name].filter(Boolean).join(" • ") || "Sem cliente"}
                  </p>
                </div>
                <Badge variant="secondary" className="hidden font-normal capitalize sm:inline-flex">{t.priority}</Badge>
                <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {t.due_date ? fmtTime(t.due_date) : "—"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>


        {/* Projetos em andamento */}
        <Card className="shadow-[var(--shadow-soft)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 sm:p-6">
            <CardTitle className="text-base">Projetos em andamento</CardTitle>
            <Button asChild variant="outline" size="sm"><Link to="/projetos">Ver todos</Link></Button>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6">
            {data?.projects.length === 0 && (
              <EmptyState icon={FolderKanban} text="Nenhum projeto ativo" cta="Criar projeto" to="/projetos" />
            )}
            {data?.projects.map((p: any) => (
              <div key={p.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.clients?.name ?? "Sem cliente"}</p>
                  </div>
                  <span className="text-xs font-medium tabular-nums">{p.progress ?? 0}%</span>
                </div>
                <Progress value={p.progress ?? 0} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Próximos eventos */}
        <Card className="shadow-[var(--shadow-soft)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 sm:p-6">
            <CardTitle className="text-base">Próximos eventos</CardTitle>
            <Button asChild variant="outline" size="sm"><Link to="/agenda">Ver agenda</Link></Button>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 sm:px-6 sm:pb-6">
            {data?.events.length === 0 && (
              <EmptyState icon={CalIcon} text="Nenhum evento próximo" cta="Criar evento" to="/agenda" />
            )}
            {data?.events.map((e: any) => {
              const d = new Date(e.start_at);
              return (
                <div key={e.id} className="flex items-center gap-4">
                  <div className="w-12 text-center rounded-lg bg-muted py-2">
                    <div className="text-lg font-semibold leading-none text-primary">{d.getDate()}</div>
                    <div className="text-[10px] text-muted-foreground mt-1 uppercase">
                      {d.toLocaleString("pt-BR", { month: "short" }).replace(".", "")}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtTime(e.start_at)}{e.end_at ? ` - ${fmtTime(e.end_at)}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="hidden font-normal capitalize sm:inline-flex">{e.event_type ?? "evento"}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
      </section>
    </div>
  );
}

function EmptyState({ icon: Icon, text, cta, to }: { icon: any; text: string; cta: string; to: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground mb-3">{text}</p>
      <Button asChild size="sm" variant="outline">
        <Link to={to}><Plus className="h-3.5 w-3.5 mr-1" />{cta}</Link>
      </Button>
    </div>
  );
}

