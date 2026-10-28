import { createFileRoute } from "@tanstack/react-router";
import { AppLink } from "@/components/AppLink";
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardList, FolderKanban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { taskState, useMyTasks } from "@/hooks/useMyTasks";
import type { MyTask } from "@/lib/tasks/my-tasks.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/minhas-tarefas")({
  head: () => ({ meta: [{ title: "Minhas tarefas — Core Suite" }] }),
  component: MyTasksPage,
});

const GROUPS: { key: ReturnType<typeof taskState>; label: string; icon: typeof AlertCircle; tone: string }[] = [
  { key: "late", label: "Atrasadas", icon: AlertCircle, tone: "text-rose-600" },
  { key: "today", label: "Para hoje", icon: CalendarClock, tone: "text-amber-600" },
  { key: "next", label: "Próximas", icon: ClipboardList, tone: "text-sky-700" },
  { key: "none", label: "Sem prazo", icon: ClipboardList, tone: "text-muted-foreground" },
];

function MyTasksPage() {
  const q = useMyTasks();
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Minhas tarefas</h1>
        <p className="text-sm text-muted-foreground">
          Tarefas designadas a você. Toque numa tarefa para abrir no projeto, na etapa certa.
        </p>
      </header>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Atrasadas" value={q.late} tone="text-rose-600" />
        <Stat label="Para hoje" value={q.today} tone="text-amber-600" />
        <Stat label="Em aberto" value={q.open} />
      </div>
      {q.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : q.list.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          <p className="font-semibold">Nenhuma tarefa em aberto para você.</p>
        </Card>
      ) : (
        GROUPS.map((g) => {
          const items = q.list.filter((t) => taskState(t) === g.key);
          if (!items.length) return null;
          const Icon = g.icon;
          return (
            <section key={g.key} aria-label={g.label} className="space-y-2">
              <h2 className={cn("flex items-center gap-2 text-sm font-bold uppercase tracking-wider", g.tone)}>
                <Icon className="h-4 w-4" /> {g.label} ({items.length})
              </h2>
              <ul className="space-y-2">
                {items.map((t) => <TaskItem key={t.id} t={t} late={g.key === "late"} />)}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-3xl font-extrabold tabular-nums", tone)}>{value}</p>
    </Card>
  );
}

function TaskItem({ t, late }: { t: MyTask; late: boolean }) {
  return (
    <li>
      <AppLink
        href={t.href}
        className={cn(
          "flex items-start gap-3 rounded-xl border bg-card p-3 transition hover:border-primary hover:shadow-sm",
          late && "border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/5",
        )}
      >
        <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{t.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t.project_name ? `${t.project_name}${t.stage_name ? ` · ${t.stage_name}` : ""}` : "Agenda"}
          </p>
        </div>
        {t.due_date && (
          <span className={cn("shrink-0 text-xs font-semibold", late ? "text-rose-600" : "text-muted-foreground")}>
            {new Date(t.due_date).toLocaleDateString("pt-BR")}
          </span>
        )}
      </AppLink>
    </li>
  );
}
