import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Columns3,
  ListChecks,
  MessageSquare,
  Rows3,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { PortalShell, usePortalSession } from "@/components/portal/PortalShell";
import { portalAuth, portalLoginPath } from "@/lib/portal/portal-client";
import {
  portalAddComment,
  portalProject,
  portalSetTaskDone,
  type PortalProject,
  type PortalStage,
  type PortalTask,
} from "@/lib/portal/portal.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal/$projectId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Projeto — Portal do cliente" }] }),
  component: PortalProjectPage,
});

export type View = "vertical" | "horizontal";
const VIEW_KEY = "portal_roadmap_view";

function fmtDate(d?: string | null) {
  if (!d) return null;
  const dt = d.length <= 10 ? new Date(`${d}T12:00:00`) : new Date(d);
  return dt.toLocaleDateString("pt-BR");
}

const STATUS_LABEL: Record<string, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

const isTaskDone = (t: PortalTask) => t.status === "concluido";

export type StageView = {
  stage: PortalStage;
  index: number;
  tasks: PortalTask[];
  done: boolean;
  current: boolean;
  doneCount: number;
  mineOpen: number;
  percent: number;
};

/** Etapas com tarefas, % e situação (concluída / atual) calculadas para a tela. */
export function buildStageViews(d: PortalProject | undefined): StageView[] {
  if (!d) return [];
  const byStage = new Map<string, PortalTask[]>();
  for (const t of d.tasks) {
    const k = t.stage_id ?? "_";
    byStage.set(k, [...(byStage.get(k) ?? []), t]);
  }
  const list: Omit<StageView, "current">[] = d.stages.map((s, i) => {
    const tasks = byStage.get(s.id) ?? [];
    const doneCount = tasks.filter(isTaskDone).length;
    const allTasksDone = tasks.length > 0 && doneCount === tasks.length;
    const done = s.status === "done" || (s.percent ?? 0) >= 100 || allTasksDone;
    return {
      stage: s,
      index: i,
      tasks,
      done,
      doneCount,
      mineOpen: tasks.filter((t) => t.responsible_type === "cliente" && !isTaskDone(t)).length,
      percent: done
        ? 100
        : tasks.length
          ? Math.round((doneCount / tasks.length) * 100)
          : Math.round(s.percent ?? 0),
    };
  });
  const loose = byStage.get("_") ?? [];
  if (loose.length) {
    const doneCount = loose.filter(isTaskDone).length;
    list.push({
      stage: {
        id: "_",
        name: "Outras tarefas",
        status: doneCount === loose.length ? "done" : "in_progress",
        percent: 0,
        start_date: null,
        due_date: null,
      },
      index: list.length,
      tasks: loose,
      done: doneCount === loose.length,
      doneCount,
      mineOpen: loose.filter((t) => t.responsible_type === "cliente" && !isTaskDone(t)).length,
      percent: Math.round((doneCount / loose.length) * 100),
    });
  }
  const currentIdx = list.findIndex((s) => !s.done);
  return list.map((s, i) => ({ ...s, current: i === currentIdx }));
}

function PortalProjectPage() {
  const { projectId } = Route.useParams();
  const session = usePortalSession(projectId);
  const qc = useQueryClient();
  const getFn = useServerFn(portalProject);
  const doneFn = useServerFn(portalSetTaskDone);
  const key = ["portal-project", projectId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => session.call((token) => getFn({ data: { token, projectId } })),
    enabled: session.ready,
    refetchInterval: 30_000,
    retry: (n, e) => !String((e as Error)?.message).includes("NOT_CLIENT") && n < 2,
  });

  const [view, setView] = useState<View>("vertical");
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "vertical" || v === "horizontal") setView(v);
    } catch {
      /* sem storage */
    }
  }, []);
  function changeView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* sem storage */
    }
  }

  const toggle = useMutation({
    mutationFn: (v: { taskId: string; done: boolean }) =>
      session.call((token) => doneFn({ data: { token, ...v } })),
    // marca na hora (verde) e confirma com o servidor
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PortalProject>(key);
      if (prev) {
        qc.setQueryData<PortalProject>(key, {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === v.taskId
              ? {
                  ...t,
                  status: v.done ? "concluido" : "a_fazer",
                  completed_at: v.done ? new Date().toISOString() : null,
                }
              : t,
          ),
        });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (_r, v) => {
      toast.success(v.done ? "Tarefa concluída. A equipe foi avisada." : "Tarefa reaberta.");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });

  const d = q.data;
  const stages = useMemo(() => buildStageViews(d), [d]);

  const realStages = stages.filter((s) => s.stage.id !== "_");
  const doneStages = realStages.filter((s) => s.done).length;
  const progress = realStages.length
    ? Math.round(realStages.reduce((a, s) => a + s.percent, 0) / realStages.length)
    : 0;
  const mineOpen = stages.reduce((a, s) => a + s.mineOpen, 0);
  const color = d?.organization?.brand_color || "#0f2b4c";
  const notClient = q.isError && String((q.error as Error)?.message).includes("NOT_CLIENT");

  return (
    <PortalShell
      brand={d?.organization}
      title={d?.project.name ?? "Carregando projeto…"}
      subtitle={
        d
          ? `${d.organization?.name ?? ""}${d.organization?.name ? " · " : ""}Portal do cliente`
          : undefined
      }
      session={session}
      projectRef={projectId}
    >
      {!session.ready || q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : notClient ? (
        <NotClientCard email={session.email} projectRef={projectId} />
      ) : q.isError || !d ? (
        <div className="space-y-3 rounded-xl border bg-card p-6 text-sm">
          <p className="text-rose-600">Não foi possível carregar o projeto.</p>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Resumo */}
          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {doneStages} de {realStages.length} etapas concluídas
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">{progress}%</p>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${progress}%`, backgroundColor: color }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {(d.project.start_date || d.project.due_date) && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {fmtDate(d.project.start_date) ?? "—"} → {fmtDate(d.project.due_date) ?? "—"}
                    </span>
                  )}
                  {mineOpen > 0 ? (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                      <ListChecks className="h-3.5 w-3.5" /> {mineOpen} tarefa(s) sua(s) pendente(s)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <Check className="h-3.5 w-3.5" /> Nenhuma pendência sua
                    </span>
                  )}
                </div>
              </div>
              <ViewToggle view={view} onChange={changeView} />
            </div>
          </section>

          {stages.length === 0 ? (
            <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
              O roadmap deste projeto ainda está sendo montado pela equipe.
            </p>
          ) : view === "vertical" ? (
            <VerticalRoadmap
              stages={stages}
              color={color}
              onToggle={(taskId, done) => toggle.mutate({ taskId, done })}
              session={session}
              projectId={projectId}
            />
          ) : (
            <HorizontalRoadmap
              stages={stages}
              color={color}
              onToggle={(taskId, done) => toggle.mutate({ taskId, done })}
              session={session}
              projectId={projectId}
            />
          )}

          {d.team.length > 0 && (
            <section className="rounded-2xl border bg-card p-4 sm:p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" /> Equipe do projeto
              </h2>
              <div className="flex flex-wrap gap-2">
                {d.team.map((m, i) => (
                  <span key={i} className="rounded-full border px-3 py-1 text-xs">
                    {m.name ?? "Equipe"}
                    {m.role ? <span className="text-muted-foreground"> · {m.role}</span> : null}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PortalShell>
  );
}

export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: { v: View; label: string; icon: typeof Rows3 }[] = [
    { v: "vertical", label: "Vertical", icon: Rows3 },
    { v: "horizontal", label: "Horizontal", icon: Columns3 },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Visualização do roadmap"
      className="inline-flex shrink-0 self-start rounded-lg border bg-muted/50 p-1 sm:self-center"
    >
      {opts.map(({ v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
            view === v
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" /> {label}
        </button>
      ))}
    </div>
  );
}

type RoadmapProps = {
  stages: StageView[];
  color: string;
  onToggle: (taskId: string, done: boolean) => void;
  session: ReturnType<typeof usePortalSession>;
  projectId: string;
};

/* ------------------------------- Vertical ------------------------------- */

export function VerticalRoadmap({ stages, color, onToggle, session, projectId }: RoadmapProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const flip = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <ol className="relative space-y-3">
      {stages.map((s, i) => {
        const isOpen = open.has(s.stage.id);
        const last = i === stages.length - 1;
        return (
          <li key={s.stage.id} className="relative flex gap-3 sm:gap-4">
            {/* linha do tempo */}
            <div className="relative flex w-9 shrink-0 flex-col items-center">
              <StageDot s={s} color={color} />
              {!last && (
                <span
                  className={cn(
                    "mt-1 w-0.5 flex-1 rounded-full",
                    s.done ? "bg-emerald-400" : "bg-border",
                  )}
                />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <StageCard s={s} color={color} open={isOpen} onOpen={() => flip(s.stage.id)}>
                {isOpen && (
                  <TaskList
                    tasks={s.tasks}
                    onToggle={onToggle}
                    session={session}
                    projectId={projectId}
                  />
                )}
              </StageCard>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------ Horizontal ------------------------------ */

export function HorizontalRoadmap({ stages, color, onToggle, session, projectId }: RoadmapProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = stages.find((s) => s.stage.id === openId) ?? null;
  return (
    <div className="space-y-4">
      <div className="-mx-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin]">
        <ol className="flex snap-x snap-mandatory gap-3">
          {stages.map((s, i) => (
            <li
              key={s.stage.id}
              className="relative flex w-[82%] shrink-0 snap-start flex-col sm:w-64 lg:w-72"
            >
              {/* trilho entre as etapas */}
              <div className="mb-2 flex items-center gap-2">
                <StageDot s={s} color={color} />
                {i < stages.length - 1 && (
                  <span
                    className={cn(
                      "h-0.5 flex-1 rounded-full",
                      s.done ? "bg-emerald-400" : "bg-border",
                    )}
                  />
                )}
              </div>
              <StageCard
                s={s}
                color={color}
                open={openId === s.stage.id}
                onOpen={() => setOpenId((cur) => (cur === s.stage.id ? null : s.stage.id))}
                compact
              />
            </li>
          ))}
        </ol>
      </div>

      {selected && (
        <section
          className={cn(
            "rounded-2xl border p-4 sm:p-5",
            selected.done ? "border-emerald-300 bg-emerald-50/60" : "bg-card",
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Etapa {selected.index + 1}</p>
              <h3 className="font-semibold">{selected.stage.name}</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
              <ChevronUp className="h-4 w-4" /> Fechar
            </Button>
          </div>
          <TaskList
            tasks={selected.tasks}
            onToggle={onToggle}
            session={session}
            projectId={projectId}
            bare
          />
        </section>
      )}
    </div>
  );
}

/* ------------------------------- Peças --------------------------------- */

function StageDot({ s, color }: { s: StageView; color: string }) {
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold",
        s.done
          ? "border-emerald-500 bg-emerald-500 text-white"
          : s.current
            ? "bg-background"
            : "border-border bg-background text-muted-foreground",
      )}
      style={!s.done && s.current ? { borderColor: color, color } : undefined}
      aria-hidden
    >
      {s.done ? <Check className="h-4 w-4" /> : s.stage.id === "_" ? "•" : s.index + 1}
    </span>
  );
}

function StageCard({
  s,
  color,
  open,
  onOpen,
  compact = false,
  children,
}: {
  s: StageView;
  color: string;
  open: boolean;
  onOpen: () => void;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const total = s.tasks.length;
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition",
        compact && "flex flex-1 flex-col",
        s.done
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
          : "bg-card",
        !s.done && s.current && "shadow-sm ring-2",
        open && !s.done && "shadow-md",
      )}
      style={
        !s.done && s.current
          ? ({ "--tw-ring-color": `${color}33` } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={cn(
                "font-semibold leading-snug",
                s.done && "text-emerald-900 dark:text-emerald-200",
              )}
            >
              {s.stage.name}
            </h3>
            {s.done ? (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                Concluída
              </span>
            ) : s.current ? (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                Etapa atual
              </span>
            ) : null}
          </div>
          {(s.stage.start_date || s.stage.due_date) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fmtDate(s.stage.start_date) ?? "—"} → {fmtDate(s.stage.due_date) ?? "—"}
            </p>
          )}
        </div>
        {!compact && (
          <span
            className={cn(
              "shrink-0 text-sm font-semibold tabular-nums",
              s.done ? "text-emerald-700" : "",
            )}
          >
            {s.percent}%
          </span>
        )}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${s.percent}%`, backgroundColor: s.done ? "#10b981" : color }}
        />
      </div>

      <div
        className={cn(
          "mt-3 flex flex-wrap items-center justify-between gap-2",
          compact && "mt-auto pt-3",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {s.doneCount}/{total} tarefa{total === 1 ? "" : "s"}
          </span>
          {s.mineOpen > 0 && (
            <span className="font-medium text-amber-700">{s.mineOpen} sua(s) para fazer</span>
          )}
        </div>
        <Button
          size="sm"
          variant={open ? "secondary" : "outline"}
          className="h-8"
          onClick={onOpen}
          aria-expanded={open}
          disabled={total === 0}
        >
          {total === 0 ? (
            "Sem tarefas"
          ) : open ? (
            <>
              <ChevronUp className="h-4 w-4" /> Fechar
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" /> Abrir
            </>
          )}
        </Button>
      </div>
      {children}
    </div>
  );
}

function TaskList({
  tasks,
  onToggle,
  session,
  projectId,
  bare = false,
}: {
  tasks: PortalTask[];
  onToggle: (taskId: string, done: boolean) => void;
  session: ReturnType<typeof usePortalSession>;
  projectId: string;
  bare?: boolean;
}) {
  // suas tarefas pendentes primeiro, concluídas por último
  const ordered = [...tasks].sort((a, b) => {
    const rank = (t: PortalTask) => (isTaskDone(t) ? 2 : t.responsible_type === "cliente" ? 0 : 1);
    return rank(a) - rank(b);
  });
  return (
    <ul className={cn("space-y-2", !bare && "mt-4 border-t pt-4")}>
      {ordered.map((t) => (
        <TaskRow key={t.id} task={t} onToggle={onToggle} session={session} projectId={projectId} />
      ))}
    </ul>
  );
}

function TaskRow({
  task,
  onToggle,
  session,
  projectId,
}: {
  task: PortalTask;
  onToggle: (taskId: string, done: boolean) => void;
  session: ReturnType<typeof usePortalSession>;
  projectId: string;
}) {
  const qc = useQueryClient();
  const commentFn = useServerFn(portalAddComment);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const isMine = task.responsible_type === "cliente";
  const isDone = isTaskDone(task);
  const overdue =
    !isDone && task.due_date && new Date(task.due_date) < new Date(new Date().toDateString());

  const send = useMutation({
    mutationFn: () =>
      session.call((token) => commentFn({ data: { token, taskId: task.id, body } })),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["portal-project", projectId] });
      toast.success("Mensagem enviada à equipe.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li
      className={cn(
        "rounded-xl border p-3 transition",
        isDone
          ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-500/10"
          : isMine
            ? "border-amber-300/80 bg-background"
            : "bg-background",
      )}
    >
      <div className="flex items-start gap-3">
        {isMine ? (
          <Checkbox
            className={cn(
              "mt-0.5 h-6 w-6 rounded-md",
              isDone && "border-emerald-600 data-[state=checked]:bg-emerald-600",
            )}
            checked={isDone}
            onCheckedChange={(v) => onToggle(task.id, v === true)}
            aria-label={isDone ? "Reabrir tarefa" : "Marcar como concluída"}
          />
        ) : (
          <span
            className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center"
            title="Responsabilidade da equipe"
          >
            {isDone ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium",
              isDone &&
                "text-emerald-900 line-through decoration-emerald-600/40 dark:text-emerald-200",
            )}
          >
            {task.title}
          </p>
          {task.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 font-medium",
                isMine ? "border-amber-300 text-amber-700" : "text-muted-foreground",
              )}
            >
              {isMine ? "Sua tarefa" : "Equipe"}
            </span>
            {!isMine && !isDone && (
              <span className="text-muted-foreground">
                {STATUS_LABEL[task.status] ?? task.status}
              </span>
            )}
            {task.due_date && !isDone && (
              <span className={cn("text-muted-foreground", overdue && "font-medium text-rose-600")}>
                Prazo {fmtDate(task.due_date)}
                {overdue ? " (atrasada)" : ""}
              </span>
            )}
            {isDone && (
              <span className="font-medium text-emerald-700">
                Concluída{task.completed_at ? ` em ${fmtDate(task.completed_at)}` : ""}
              </span>
            )}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {task.comments.length > 0 ? `${task.comments.length} mensagem(ns)` : "Mensagem"}
            </button>
          </div>

          {open && (
            <div className="mt-3 space-y-2">
              {task.comments.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    c.mine ? "bg-primary/5" : "bg-muted",
                  )}
                >
                  <p className="text-[11px] text-muted-foreground">
                    {c.mine ? "Você" : c.author} · {new Date(c.created_at).toLocaleString("pt-BR")}
                  </p>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              <div className="flex items-end gap-2">
                <Textarea
                  rows={2}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Escreva uma mensagem para a equipe…"
                  className="min-h-[60px] text-sm"
                />
                <Button
                  size="icon"
                  disabled={!body.trim() || send.isPending}
                  onClick={() => send.mutate()}
                  aria-label="Enviar mensagem"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Entrou com uma conta que não é cliente deste projeto. */
function NotClientCard({ email, projectRef }: { email: string | null; projectRef: string }) {
  async function switchAccount() {
    await portalAuth().auth.signOut();
    window.location.replace(portalLoginPath(projectRef));
  }
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-6 text-sm">
      <p className="font-medium">Esta conta não tem acesso a este projeto.</p>
      <p className="text-muted-foreground">
        Você entrou como <strong>{email ?? "outro usuário"}</strong>. Entre com o e-mail e a senha
        que vieram no convite deste projeto. Se você é da equipe, acompanhe o projeto pelo Core.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={switchAccount}>Entrar com outra conta</Button>
        <Button variant="outline" asChild>
          <a href="/projetos">Abrir o Core</a>
        </Button>
      </div>
    </div>
  );
}
