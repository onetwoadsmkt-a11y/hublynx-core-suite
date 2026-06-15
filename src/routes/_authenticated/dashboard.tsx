import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, FolderKanban, Calendar as CalIcon, Users, Plus } from "lucide-react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Hublynx Core" }] }),
  component: Dashboard,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Não encontrado.</div>,
});

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString(), startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
function plusDays(n: number) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function Dashboard() {
  const qc = useQueryClient();
  const today = todayRange();
  const in7 = plusDays(7);
  const minus7 = plusDays(-7);

  const { data: me } = useQuery({
    queryKey: ["me-dash"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", u.user!.id).maybeSingle();
      return p?.full_name?.split(" ")[0] ?? "por aí";
    },
  });

  // KPIs + lists in one shot
  const { data } = useQuery({
    queryKey: ["dashboard-data"],
    queryFn: async () => {
      const [
        tasksToday, tasksOverdue,
        projectsActive, projectsOverdue,
        receivables7, eventsToday,
        clientsActive,
        tasksTodayList, projectsList, eventsList,
        finReceiveWeek, finPayWeek, finHistory,
      ] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact", head: true })
          .gte("due_date", today.start).lte("due_date", today.end).neq("status", "concluido"),
        supabase.from("tasks").select("id", { count: "exact", head: true })
          .lt("due_date", today.start).neq("status", "concluido"),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "ativo"),
        supabase.from("projects").select("id", { count: "exact", head: true })
          .lt("due_date", today.startDate).not("status", "in", "(concluido,cancelado)"),
        supabase.from("finances").select("amount")
          .eq("kind", "receber").eq("status", "pendente")
          .gte("due_date", today.startDate).lte("due_date", in7),
        supabase.from("events").select("id,title,start_at,event_type")
          .gte("start_at", today.start).lte("start_at", today.end).order("start_at"),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "ativo"),
        supabase.from("tasks")
          .select("id,title,priority,status,due_date,project_id,client_id,projects(name),clients(name)")
          .gte("due_date", today.start).lte("due_date", today.end).order("due_date").limit(6),
        supabase.from("projects")
          .select("id,name,progress,color,clients(name)")
          .eq("status", "ativo").order("updated_at", { ascending: false }).limit(5),
        supabase.from("events")
          .select("id,title,start_at,end_at,event_type")
          .gte("start_at", today.start).order("start_at").limit(4),
        supabase.from("finances").select("amount,due_date,paid_at")
          .eq("kind", "receber").gte("due_date", today.startDate).lte("due_date", in7),
        supabase.from("finances").select("amount,due_date,paid_at")
          .eq("kind", "pagar").gte("due_date", today.startDate).lte("due_date", in7),
        supabase.from("finances").select("amount,kind,due_date")
          .gte("due_date", minus7).lte("due_date", in7),
      ]);

      const recvTotal = (receivables7.data ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0);
      const recvWeek = (finReceiveWeek.data ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0);
      const payWeek = (finPayWeek.data ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0);

      // Build 7-day sparkline buckets
      const buckets = (kind: "receber" | "pagar") => {
        const days: { i: number; v: number }[] = [];
        for (let i = -3; i <= 3; i++) {
          const day = plusDays(i);
          const v = (finHistory.data ?? [])
            .filter((r: any) => r.kind === kind && r.due_date === day)
            .reduce((s, r: any) => s + Number(r.amount || 0), 0);
          days.push({ i: i + 3, v });
        }
        return days;
      };
      const seriesR = buckets("receber");
      const seriesP = buckets("pagar");
      const seriesS = seriesR.map((r, i) => ({ i: r.i, v: r.v - seriesP[i].v }));

      const nextEvent = (eventsToday.data ?? []).find((e: any) => new Date(e.start_at) >= new Date());

      return {
        kpi: {
          tasksToday: tasksToday.count ?? 0,
          tasksOverdue: tasksOverdue.count ?? 0,
          projectsActive: projectsActive.count ?? 0,
          projectsOverdue: projectsOverdue.count ?? 0,
          receivables: recvTotal,
          receivablesCount: receivables7.data?.length ?? 0,
          eventsToday: eventsToday.data?.length ?? 0,
          nextEventTime: nextEvent ? fmtTime(nextEvent.start_at) : null,
          clientsActive: clientsActive.count ?? 0,
        },
        tasks: tasksTodayList.data ?? [],
        projects: projectsList.data ?? [],
        events: eventsList.data ?? [],
        finance: { recvWeek, payWeek, balance: recvWeek - payWeek, seriesR, seriesP, seriesS },
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
    <div className="space-y-6">

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {KPI.map((kp) => {
          const Icon = kp.icon;
          return (
            <Card key={kp.title} className="border-border/60 shadow-[var(--shadow-soft)]">
              <CardContent className="p-5">
                <div className={`h-10 w-10 rounded-lg ${kp.color} flex items-center justify-center`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{kp.title}</p>
                <p className="mt-1 text-2xl font-semibold">{kp.value}</p>
                <p className={`mt-1 text-xs ${kp.subTone}`}>{kp.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tarefas do dia */}
        <Card className="shadow-[var(--shadow-soft)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Tarefas do dia</CardTitle>
            <Button asChild variant="outline" size="sm"><Link to="/tarefas" search={{ task: undefined }}>Ver todas</Link></Button>
          </CardHeader>
          <CardContent className="space-y-1">
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
                <Badge variant="secondary" className="font-normal capitalize">{t.priority}</Badge>
                <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                  {t.due_date ? fmtTime(t.due_date) : "—"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>


        {/* Projetos em andamento */}
        <Card className="shadow-[var(--shadow-soft)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Projetos em andamento</CardTitle>
            <Button asChild variant="outline" size="sm"><Link to="/projetos">Ver todos</Link></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.projects.length === 0 && (
              <EmptyState icon={FolderKanban} text="Nenhum projeto ativo" cta="Criar projeto" to="/projetos" />
            )}
            {data?.projects.map((p: any) => (
              <div key={p.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.clients?.name ?? "Sem cliente"}</p>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Próximos eventos</CardTitle>
            <Button asChild variant="outline" size="sm"><Link to="/agenda">Ver agenda</Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
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
                  <Badge variant="secondary" className="font-normal capitalize">{e.event_type ?? "evento"}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
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

