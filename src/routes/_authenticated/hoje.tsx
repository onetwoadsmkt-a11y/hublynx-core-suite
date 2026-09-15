import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getTodayTasks, type TodayTask } from "@/lib/today/today.functions";
import { getAgendaEvents } from "@/lib/agenda/agenda.functions";
import type { AgendaEvent } from "@/lib/agenda/types";

export const Route = createFileRoute("/_authenticated/hoje")({
  head: () => ({
    meta: [
      { title: "Hoje — Hublynx Core" },
      {
        name: "description",
        content: "Suas tarefas vencidas, as de hoje, os compromissos do dia e o que vence nos próximos 7 dias.",
      },
      { property: "og:title", content: "Hoje — Hublynx Core" },
      {
        property: "og:description",
        content: "Sua lista do dia: vencidas, vencendo hoje, agenda e próximos 7 dias.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TodayPage,
});

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const fmtDayLabel = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }).format(
    new Date(iso),
  );

function daysOverdue(iso: string) {
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((today.getTime() - due.getTime()) / 86_400_000));
}

function ContextLine({ project, client }: { project: string | null; client: string | null }) {
  const parts = [project, client].filter(Boolean) as string[];
  return (
    <p className="text-xs text-muted-foreground truncate">
      {parts.length ? parts.join(" • ") : "Sem projeto ou cliente"}
    </p>
  );
}

function TaskRow({
  task,
  tone,
  onOpen,
}: {
  task: TodayTask;
  tone: "overdue" | "today" | "upcoming";
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left rounded-xl border p-3 transition hover:bg-muted/50 ${
        tone === "overdue" ? "border-rose-500/40 bg-rose-500/5" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate">{task.title}</p>
          <ContextLine project={task.project_name} client={task.client_name} />
        </div>
        {tone === "overdue" ? (
          <Badge variant="outline" className="shrink-0 border-rose-500/40 text-rose-600">
            {daysOverdue(task.due_date)} dia(s)
          </Badge>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">{fmtTime(task.due_date)}</span>
        )}
      </div>
    </button>
  );
}

function SectionTitle({
  icon: Icon,
  children,
  tone,
}: {
  icon: typeof Clock;
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <h2
      className={`flex items-center gap-2 text-sm font-semibold ${
        tone === "danger" ? "text-rose-600" : "text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" /> {children}
    </h2>
  );
}

function TodayPage() {
  const navigate = useNavigate();
  const { activeOrganization } = useWorkspace();
  const orgId = activeOrganization?.id ?? null;

  const tasksFn = useServerFn(getTodayTasks);
  const agendaFn = useServerFn(getAgendaEvents);

  const range = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const tasksQ = useQuery({
    queryKey: ["today-tasks", orgId],
    queryFn: () => tasksFn({ data: { organizationId: orgId } }),
    staleTime: 60_000,
  });

  const agendaQ = useQuery({
    queryKey: ["today-agenda", range.from],
    queryFn: () => agendaFn({ data: range }),
    staleTime: 60_000,
  });

  const openTask = (id: string) => navigate({ to: "/tarefas", search: { task: id } as never });
  const openEvent = (ev: AgendaEvent) => {
    if (ev.taskId) return openTask(ev.taskId);
    navigate({ to: "/agenda", search: { view: "day", date: range.from } as never });
  };

  const overdue = tasksQ.data?.overdue ?? [];
  const today = tasksQ.data?.today ?? [];
  const upcoming = tasksQ.data?.upcoming ?? [];

  const meetings = useMemo(
    () =>
      (agendaQ.data?.events ?? [])
        .filter((e) => e.source !== "task")
        .sort((a, b) => a.start.localeCompare(b.start)),
    [agendaQ.data],
  );

  const upcomingByDay = useMemo(() => {
    const groups = new Map<string, TodayTask[]>();
    for (const t of upcoming) {
      const key = t.due_date.slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [upcoming]);

  const loading = tasksQ.isLoading || agendaQ.isLoading;
  const empty =
    !loading && overdue.length === 0 && today.length === 0 && meetings.length === 0 && upcoming.length === 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-6 md:px-6">
      <header>
        <p className="text-sm text-muted-foreground capitalize">
          {new Intl.DateTimeFormat("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          }).format(new Date())}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight mt-0.5">Hoje</h1>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {empty && (
        <Card className="rounded-2xl p-8 text-center space-y-2">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500" />
          <p className="font-medium">Tudo em dia!</p>
          <p className="text-sm text-muted-foreground">
            Nada pendente por agora. Aproveite para adiantar o que vem aí.
          </p>
        </Card>
      )}

      {overdue.length > 0 && (
        <section className="space-y-2">
          <SectionTitle icon={AlertTriangle} tone="danger">
            Vencidas ({overdue.length})
          </SectionTitle>
          <div className="space-y-2">
            {overdue.map((t) => (
              <TaskRow key={t.id} task={t} tone="overdue" onOpen={() => openTask(t.id)} />
            ))}
          </div>
        </section>
      )}

      {today.length > 0 && (
        <section className="space-y-2">
          <SectionTitle icon={Clock}>Vencem hoje ({today.length})</SectionTitle>
          <div className="space-y-2">
            {today.map((t) => (
              <TaskRow key={t.id} task={t} tone="today" onOpen={() => openTask(t.id)} />
            ))}
          </div>
        </section>
      )}

      {meetings.length > 0 && (
        <section className="space-y-2">
          <SectionTitle icon={CalendarClock}>Agenda de hoje ({meetings.length})</SectionTitle>
          <div className="space-y-2">
            {meetings.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => openEvent(ev)}
                className="w-full text-left rounded-xl border p-3 transition hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{ev.title}</p>
                    <ContextLine project={ev.projectName ?? null} client={ev.clientName ?? null} />
                  </div>
                  <span className="shrink-0 text-xs font-medium">
                    {ev.allDay ? "Dia todo" : fmtTime(ev.start)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {upcomingByDay.length > 0 && (
        <section className="space-y-3">
          <SectionTitle icon={Sparkles}>Próximos 7 dias</SectionTitle>
          {upcomingByDay.map(([day, items]) => (
            <div key={day} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground capitalize">
                {fmtDayLabel(`${day}T12:00:00`)}
              </p>
              <div className="space-y-2">
                {items.map((t) => (
                  <TaskRow key={t.id} task={t} tone="upcoming" onOpen={() => openTask(t.id)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
