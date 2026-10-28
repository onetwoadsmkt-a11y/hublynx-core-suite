import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  Columns3,
  History,
  MessageSquare,
  Rows3,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PortalShell, usePortalSession } from "@/components/portal/PortalShell";
import { portalAuth, portalLoginPath } from "@/lib/portal/portal-client";
import { useProjectEvents } from "@/lib/realtime/project-events";
import { JourneyTimeline } from "@/components/projects/JourneyTimeline";
import { TaskAttachments } from "@/components/projects/TaskAttachments";
import {
  portalAddComment,
  portalAddMessage,
  portalAttachmentUrl,
  portalJourney,
  portalProject,
  portalRemoveAttachment,
  portalSetTaskDone,
  portalUploadAttachment,
  type PortalProject,
  type PortalStage,
  type PortalTask,
} from "@/lib/portal/portal.functions";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";

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
    refetchInterval: 120_000,
    retry: (n, e) => !/NOT_CLIENT|TEAM_MEMBER/.test(String((e as Error)?.message)) && n < 2,
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
      qc.invalidateQueries({ queryKey: ["portal-journey", projectId] });
    },
  });

  const d = q.data;
  const journeyFn = useServerFn(portalJourney);
  const messageFn = useServerFn(portalAddMessage);
  const projectUuid = d?.project.id ?? null;
  const journey = useQuery({
    queryKey: ["portal-journey", projectId],
    queryFn: () => session.call((token) => journeyFn({ data: { token, projectId: projectUuid! } })),
    enabled: session.ready && !!projectUuid,
    refetchInterval: 120_000,
  });
  const sendMessage = useMutation({
    mutationFn: (body: string) =>
      session.call((token) => messageFn({ data: { token, projectId: projectUuid!, body } })),
    onSuccess: () => {
      toast.success("Mensagem enviada à equipe.");
      qc.invalidateQueries({ queryKey: ["portal-journey", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // tempo real: qualquer mudança no projeto (Core ou portal) atualiza esta tela
  useProjectEvents(session.ready ? portalAuth() : null, projectUuid, () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["portal-journey", projectId] });
  });
  const stages = useMemo(() => buildStageViews(d), [d]);

  const realStages = stages.filter((s) => s.stage.id !== "_");
  const doneStages = realStages.filter((s) => s.done).length;
  const progress = realStages.length
    ? Math.round(realStages.reduce((a, s) => a + s.percent, 0) / realStages.length)
    : 0;
  const mineOpen = stages.reduce((a, s) => a + s.mineOpen, 0);
  const mineTasks = stages.flatMap((s) => s.tasks.filter((t) => t.responsible_type === "cliente"));
  const mineTotal = mineTasks.length;
  const mineDone = mineTasks.filter(isTaskDone).length;
  const current = stages.find((s) => s.current) ?? null;
  const next = (() => {
    for (const st of stages) {
      const t = st.tasks.find((x) => x.responsible_type === "cliente" && !isTaskDone(x));
      if (t) return { task: t, stage: st };
    }
    return null;
  })();

  // filtro "Minhas tarefas" e etapas abertas (a etapa atual começa aberta)
  const [mineOnly, setMineOnly] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !stages.length) return;
    opened.current = true;
    const first = stages.find((s) => s.current) ?? stages[stages.length - 1];
    setOpenIds(new Set([first.stage.id]));
  }, [stages]);
  const flipStage = (id: string) =>
    setOpenIds((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  function goToStage(id: string) {
    setOpenIds((cur) => new Set(cur).add(id));
    setSelectedId(id);
    requestAnimationFrame(() =>
      document
        .getElementById(`etapa-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  const shown = useMemo(
    () =>
      mineOnly
        ? stages.map((s) => ({
            ...s,
            tasks: s.tasks.filter((t) => t.responsible_type === "cliente"),
          }))
        : stages,
    [stages, mineOnly],
  );
  const errMsg = q.isError ? String((q.error as Error)?.message) : "";
  const teamProject = /TEAM_MEMBER:([0-9a-f-]{36})/i.exec(errMsg)?.[1] ?? null;
  const notClient = errMsg.includes("NOT_CLIENT") || !!teamProject;

  return (
    <PortalShell
      brand={d?.organization}
      logo={d?.project.logo_url}
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
        <NotClientCard email={session.email} projectRef={projectId} teamProjectId={teamProject} />
      ) : q.isError || !d ? (
        <div className="space-y-3 rounded-xl border bg-card p-6 text-sm">
          <p className="text-rose-600">Não foi possível carregar o projeto.</p>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Resumo */}
          <section
            aria-label="Resumo do projeto"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div className="flex items-center gap-4 rounded-3xl bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-20px_rgba(16,24,40,0.22)] dark:ring-1 dark:ring-white/10 p-5 sm:p-6">
              <ProgressRing value={progress} />
              <div className="min-w-0 space-y-0.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Progresso geral
                </p>
                <p
                  className="font-display text-lg font-semibold leading-tight"
                  style={{ color: "var(--brand-ink)" }}
                >
                  {doneStages} de {realStages.length} etapas
                </p>
                <p className="text-xs text-muted-foreground">
                  Suas tarefas: {mineDone} de {mineTotal} feitas
                </p>
                {(d.project.start_date || d.project.due_date) && (
                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {fmtDate(d.project.start_date) ?? "—"} → {fmtDate(d.project.due_date) ?? "—"}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-3xl bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-20px_rgba(16,24,40,0.22)] dark:ring-1 dark:ring-white/10 p-5 sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Etapa atual
              </p>
              {current ? (
                <>
                  <p
                    className="font-display text-lg font-semibold leading-tight"
                    style={{ color: "var(--brand-ink)" }}
                  >
                    {current.stage.name}
                  </p>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${current.percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {current.doneCount} de {current.tasks.length} tarefas feitas
                    {current.stage.due_date ? ` · prazo ${fmtDate(current.stage.due_date)}` : ""}
                  </p>
                </>
              ) : (
                <p className="font-display text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                  Todas as etapas concluídas
                </p>
              )}
            </div>

            <div
              className="flex flex-col gap-2 rounded-3xl p-5 text-white shadow-[0_16px_40px_-20px_rgba(16,24,40,0.45)] sm:col-span-2 sm:p-6 lg:col-span-1"
              style={{
                background:
                  "linear-gradient(140deg, var(--brand-ink) 0%, color-mix(in oklab, var(--brand-ink) 75%, var(--primary)) 100%)",
              }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                Sua próxima ação
              </p>
              {next ? (
                <>
                  <p className="font-display text-lg font-semibold leading-tight">
                    {next.task.title}
                  </p>
                  <p className="text-xs text-white/70">
                    Etapa: {next.stage.stage.name}
                    {next.task.due_date ? ` · prazo ${fmtDate(next.task.due_date)}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Button
                      className="h-11 rounded-xl"
                      onClick={() => toggle.mutate({ taskId: next.task.id, done: true })}
                    >
                      <Check className="h-4 w-4" /> Marcar como feita
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      onClick={() => goToStage(next.stage.stage.id)}
                    >
                      Ver tarefa
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-display text-lg font-semibold text-white">
                    Tudo em dia por aqui
                  </p>
                  <p className="text-xs text-white/70">Nenhuma tarefa sua pendente agora.</p>
                </>
              )}
            </div>
          </section>

          <section
            id="roadmap"
            aria-label="Roadmap"
            className="scroll-mt-4 space-y-6 rounded-3xl bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-20px_rgba(16,24,40,0.22)] dark:ring-1 dark:ring-white/10 p-4 sm:p-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                className="font-display text-2xl font-semibold tracking-tight"
                style={{ color: "var(--brand-ink)" }}
              >
                Roadmap
              </h2>
              <div className="flex flex-wrap gap-2">
                <Segmented
                  label="Filtro de tarefas"
                  value={mineOnly ? "mine" : "all"}
                  onChange={(v) => setMineOnly(v === "mine")}
                  options={[
                    { v: "all", label: "Todas" },
                    { v: "mine", label: `Minhas tarefas${mineOpen ? ` (${mineOpen})` : ""}` },
                  ]}
                />
                <ViewToggle view={view} onChange={changeView} />
              </div>
            </div>

            {stages.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                O roadmap deste projeto ainda está sendo montado pela equipe.
              </p>
            ) : view === "vertical" ? (
              <VerticalRoadmap
                stages={shown}
                openIds={openIds}
                onFlip={flipStage}
                onToggle={(taskId, done) => toggle.mutate({ taskId, done })}
                session={session}
                projectId={projectId}
                mineOnly={mineOnly}
              />
            ) : (
              <HorizontalRoadmap
                stages={shown}
                selectedId={
                  selectedId ?? current?.stage.id ?? shown[shown.length - 1]?.stage.id ?? null
                }
                onSelect={setSelectedId}
                onToggle={(taskId, done) => toggle.mutate({ taskId, done })}
                session={session}
                projectId={projectId}
                mineOnly={mineOnly}
              />
            )}
            <Legend />
          </section>

          <section className="rounded-3xl bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-20px_rgba(16,24,40,0.22)] dark:ring-1 dark:ring-white/10 p-5 sm:p-7">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4" /> Histórico e mensagens
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Tudo o que acontece no projeto fica registrado aqui, com data, hora e quem fez.
            </p>
            <JourneyTimeline
              audience="cliente"
              events={journey.data ?? []}
              loading={journey.isLoading}
              onSend={(body) => sendMessage.mutateAsync(body)}
              sending={sendMessage.isPending}
              placeholder="Escreva uma mensagem para a equipe do projeto…"
            />
          </section>

          {d.team.length > 0 && (
            <section className="rounded-3xl bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-20px_rgba(16,24,40,0.22)] dark:ring-1 dark:ring-white/10 p-5 sm:p-7">
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
  return (
    <Segmented
      label="Visualização do roadmap"
      value={view}
      onChange={(v) => onChange(v as View)}
      options={[
        { v: "vertical", label: "Vertical", icon: Rows3 },
        { v: "horizontal", label: "Horizontal", icon: Columns3 },
      ]}
    />
  );
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string; icon?: typeof Rows3 }[];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1 rounded-full bg-muted/70 p-1">
      {options.map(({ v, label: l, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition",
            value === v
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {Icon && <Icon className="h-4 w-4" />} {l}
        </button>
      ))}
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width="76"
      height="76"
      viewBox="0 0 76 76"
      role="img"
      aria-label={`Progresso geral ${value}%`}
      className="shrink-0"
    >
      <circle cx="38" cy="38" r={r} fill="none" strokeWidth="9" className="stroke-muted" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        stroke="#00D084"
        strokeDasharray={`${(c * value) / 100} ${c}`}
        transform="rotate(-90 38 38)"
        className="transition-all"
      />
      <text
        x="38"
        y="44"
        textAnchor="middle"
        className="fill-foreground font-display text-[17px] font-semibold"
      >
        {value}%
      </text>
    </svg>
  );
}

type RoadmapProps = {
  stages: StageView[];
  onToggle: (taskId: string, done: boolean) => void;
  session: ReturnType<typeof usePortalSession>;
  projectId: string;
  mineOnly: boolean;
};

const statusOf = (s: StageView) => (s.done ? "done" : s.current ? "current" : "next");

function StagePill({ s }: { s: StageView }) {
  const st = statusOf(s);
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold",
        st === "done" &&
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
        st === "current" && "bg-primary text-primary-foreground",
        st === "next" && "bg-muted text-muted-foreground",
      )}
    >
      {st === "done" ? "Concluída" : st === "current" ? "Em andamento" : "A seguir"}
    </span>
  );
}

function StageNode({ s, size = "lg" }: { s: StageView; size?: "lg" | "sm" }) {
  const st = statusOf(s);
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-2 font-display font-semibold transition",
        size === "lg" ? "h-11 w-11 text-base" : "h-8 w-8 text-xs",
        st === "done" && "border-emerald-500 bg-[#00D084] text-[#063B2A]",
        st === "current" &&
          "border-primary bg-primary text-primary-foreground ring-[6px] ring-primary/15",
        st === "next" && "border-border bg-background text-muted-foreground",
      )}
    >
      {st === "done" ? (
        <Check className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} strokeWidth={3} />
      ) : s.stage.id === "_" ? (
        "•"
      ) : (
        s.index + 1
      )}
    </span>
  );
}

function StageBar({ s, className }: { s: StageView; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-semibold text-muted-foreground">
        {s.doneCount}/{s.tasks.length || 0} tarefas
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            s.done ? "bg-[#00D084]" : "bg-primary",
          )}
          style={{ width: `${s.percent}%` }}
        />
      </div>
    </div>
  );
}

const cardTone = (s: StageView) =>
  s.done
    ? "bg-emerald-50/80 ring-1 ring-emerald-200/80 dark:bg-emerald-500/10 dark:ring-emerald-500/30"
    : s.current
      ? "bg-card ring-2 ring-primary shadow-[0_18px_40px_-22px_rgba(16,24,40,0.35)]"
      : "bg-muted/40 ring-1 ring-black/5 dark:ring-white/10";

/* ------------------------------- Vertical ------------------------------- */

export function VerticalRoadmap({
  stages,
  openIds,
  onFlip,
  onToggle,
  session,
  projectId,
  mineOnly,
}: RoadmapProps & { openIds: Set<string>; onFlip: (id: string) => void }) {
  return (
    <ol className="flex flex-col">
      {stages.map((s, i) => {
        const isOpen = openIds.has(s.stage.id);
        const last = i === stages.length - 1;
        return (
          <Fragment key={s.stage.id}>
            {!!s.stage.phase && s.stage.phase !== stages[i - 1]?.stage.phase && (
              <li className="pb-3 pt-1">
                <PhaseBanner
                  name={s.stage.phase}
                  stages={stages.filter((x) => x.stage.phase === s.stage.phase)}
                />
              </li>
            )}
            <li id={`etapa-${s.stage.id}`} className="flex scroll-mt-4 gap-3 sm:gap-4">
              <div className="flex w-11 shrink-0 flex-col items-center">
                <StageNode s={s} />
                <span
                  className={cn(
                    "w-[3px] flex-1 rounded-full",
                    last ? "bg-transparent" : s.done ? "bg-[#00D084]" : "bg-border",
                  )}
                />
              </div>
              <div className="min-w-0 flex-1 pb-4">
                <div className={cn("rounded-2xl p-4 transition sm:p-5", cardTone(s))}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          {s.stage.id === "_"
                            ? "Avulsas"
                            : s.stage.week_label || `Etapa ${s.index + 1}`}
                        </span>
                        <StagePill s={s} />
                        {s.mineOpen > 0 && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                            {s.mineOpen} sua{s.mineOpen > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <h3
                        className="font-display text-lg font-semibold leading-snug"
                        style={{ color: "var(--brand-ink)" }}
                      >
                        {s.stage.name}
                      </h3>
                      {(s.stage.start_date || s.stage.due_date) && (
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(s.stage.start_date) ?? "—"} → {fmtDate(s.stage.due_date) ?? "—"}
                        </p>
                      )}
                    </div>
                    <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
                      <StageBar s={s} className="min-w-0 max-w-[140px] flex-1 sm:w-32" />
                      <Button
                        variant="outline"
                        className="h-11 shrink-0 rounded-full border-black/10 bg-background px-4"
                        onClick={() => onFlip(s.stage.id)}
                        aria-expanded={isOpen}
                      >
                        {isOpen ? "Fechar" : "Abrir"}
                        <ChevronDown
                          className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                        />
                      </Button>
                    </div>
                  </div>
                  {s.stage.alert && (
                    <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{s.stage.alert}</span>
                    </p>
                  )}
                  {isOpen && (
                    <StageTasks
                      tasks={s.tasks}
                      onToggle={onToggle}
                      session={session}
                      projectId={projectId}
                      mineOnly={mineOnly}
                    />
                  )}
                </div>
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/* ------------------------------ Horizontal ------------------------------ */

export function HorizontalRoadmap({
  stages,
  selectedId,
  onSelect,
  onToggle,
  session,
  projectId,
  mineOnly,
}: RoadmapProps & { selectedId: string | null; onSelect: (id: string) => void }) {
  const selected = stages.find((s) => s.stage.id === selectedId) ?? stages[0];
  return (
    <div className="space-y-4">
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
        <ol className="flex gap-3">
          {stages.map((s) => {
            const sel = s.stage.id === selected?.stage.id;
            return (
              <li key={s.stage.id} className="w-[46%] min-w-[180px] shrink-0 sm:w-auto sm:flex-1">
                <button
                  type="button"
                  onClick={() => onSelect(s.stage.id)}
                  aria-pressed={sel}
                  className={cn(
                    "flex h-full min-h-[136px] w-full flex-col gap-2.5 overflow-hidden rounded-2xl px-3.5 pb-3.5 text-left transition",
                    s.done &&
                      !sel &&
                      "bg-emerald-50/80 ring-1 ring-emerald-200/80 dark:bg-emerald-500/10 dark:ring-emerald-500/30",
                    !s.done && !sel && "bg-muted/40 ring-1 ring-black/5 hover:ring-black/15",
                    sel &&
                      "bg-card shadow-[0_18px_40px_-22px_rgba(16,24,40,0.35)] ring-2 ring-[color:var(--brand-ink)]",
                  )}
                >
                  <span
                    className="-mx-3.5 block h-1.5"
                    style={{
                      background: s.done
                        ? "#00D084"
                        : s.current
                          ? `linear-gradient(90deg, var(--primary) ${s.percent}%, var(--muted) ${s.percent}%)`
                          : "var(--muted)",
                    }}
                  />
                  <span className="flex items-center gap-2">
                    <StageNode s={s} size="sm" />
                    <StagePill s={s} />
                  </span>
                  {(s.stage.phase || s.stage.week_label) && (
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {[s.stage.phase?.split("·")[0]?.trim(), s.stage.week_label]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  <span className="font-display text-[15px] font-semibold leading-snug">
                    {s.stage.name}
                  </span>
                  <span className="mt-auto text-xs font-semibold text-muted-foreground">
                    {s.doneCount}/{s.tasks.length} tarefas
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {selected && (
        <div
          id={`etapa-${selected.stage.id}`}
          className={cn("scroll-mt-4 rounded-2xl p-4 sm:p-6", cardTone(selected))}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {selected.stage.id === "_" ? "Avulsas" : `Etapa ${selected.index + 1}`} ·{" "}
                {selected.done ? "Concluída" : selected.current ? "Em andamento" : "A seguir"}
              </p>
              <h3 className="font-display text-xl font-semibold">{selected.stage.name}</h3>
            </div>
            <StageBar s={selected} className="w-40" />
          </div>
          {selected.stage.alert && (
            <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{selected.stage.alert}</span>
            </p>
          )}
          <StageTasks
            tasks={selected.tasks}
            onToggle={onToggle}
            session={session}
            projectId={projectId}
            mineOnly={mineOnly}
          />
        </div>
      )}
    </div>
  );
}

function StageTasks(props: {
  tasks: PortalTask[];
  onToggle: (taskId: string, done: boolean) => void;
  session: ReturnType<typeof usePortalSession>;
  projectId: string;
  mineOnly: boolean;
}) {
  if (props.tasks.length === 0) {
    return (
      <p className="mt-4 rounded-xl bg-background/70 p-3.5 text-sm text-muted-foreground ring-1 ring-black/5">
        {props.mineOnly
          ? "Nenhuma tarefa sua nesta etapa. A equipe cuida do restante."
          : "Nenhuma tarefa nesta etapa ainda."}
      </p>
    );
  }
  return <TaskList {...props} />;
}

function PhaseBanner({ name, stages }: { name: string; stages: StageView[] }) {
  const done = stages.filter((x) => x.done).length;
  const pct = stages.length
    ? Math.round(stages.reduce((a, x) => a + x.percent, 0) / stages.length)
    : 0;
  const starts = stages
    .map((x) => x.stage.start_date)
    .filter(Boolean)
    .sort() as string[];
  const dues = stages
    .map((x) => x.stage.due_date)
    .filter(Boolean)
    .sort() as string[];
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
      style={{ background: "color-mix(in oklab, var(--brand-ink, #0a2557) 6%, transparent)" }}
    >
      <div className="min-w-0">
        <p className="font-display text-base font-semibold" style={{ color: "var(--brand-ink)" }}>
          {name}
        </p>
        <p className="text-xs text-muted-foreground">
          {starts[0] && dues.length
            ? `${fmtDate(starts[0])} a ${fmtDate(dues[dues.length - 1])} · `
            : ""}
          {done} de {stages.length} semanas concluídas
        </p>
      </div>
      <div className="flex w-36 items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", pct >= 100 ? "bg-[#00D084]" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-semibold tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

function Legend() {
  const item = "inline-flex items-center gap-2";
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-black/5 pt-5 text-xs text-muted-foreground">
      <span className={item}>
        <span className="h-3 w-3 rounded-full bg-[#00D084]" /> Concluída
      </span>
      <span className={item}>
        <span className="h-3 w-3 rounded-full bg-primary" /> Em andamento
      </span>
      <span className={item}>
        <span className="h-3 w-3 rounded-full border-2 border-muted-foreground/50 bg-background" />{" "}
        A seguir
      </span>
      <span className={item}>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
          Sua tarefa
        </span>
        você executa e pode anexar documentos
      </span>
    </div>
  );
}

function TaskList({
  tasks,
  onToggle,
  session,
  projectId,
}: {
  tasks: PortalTask[];
  onToggle: (taskId: string, done: boolean) => void;
  session: ReturnType<typeof usePortalSession>;
  projectId: string;
  mineOnly?: boolean;
}) {
  // suas tarefas pendentes primeiro, concluídas por último
  const ordered = [...tasks].sort((a, b) => {
    const rank = (t: PortalTask) => (isTaskDone(t) ? 2 : t.responsible_type === "cliente" ? 0 : 1);
    return rank(a) - rank(b);
  });
  return (
    <ul className="mt-4 space-y-2">
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
  const uploadFn = useServerFn(portalUploadAttachment);
  const urlFn = useServerFn(portalAttachmentUrl);
  const removeFn = useServerFn(portalRemoveAttachment);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["portal-project", projectId] });
    qc.invalidateQueries({ queryKey: ["portal-journey", projectId] });
  };
  const attachments = task.attachments ?? [];
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
      refresh();
      toast.success("Mensagem enviada à equipe.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li
      className={cn(
        "rounded-xl py-1.5 pl-1 pr-3 transition",
        isDone
          ? "bg-emerald-50 ring-1 ring-emerald-200/70 dark:bg-emerald-500/10 dark:ring-emerald-500/30"
          : "bg-background ring-1 ring-black/[0.06] dark:ring-white/10",
      )}
    >
      <div className="flex items-start gap-1.5">
        {isMine ? (
          <button
            type="button"
            onClick={() => onToggle(task.id, !isDone)}
            aria-pressed={isDone}
            aria-label={isDone ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
          >
            <span
              className={cn(
                "grid h-6 w-6 place-items-center rounded-md border-2 transition",
                isDone
                  ? "border-emerald-500 bg-[#00D084] text-[#063B2A]"
                  : "border-muted-foreground/50 bg-background",
              )}
            >
              {isDone && <Check className="h-4 w-4" strokeWidth={3.2} />}
            </span>
          </button>
        ) : (
          <span
            className="grid h-11 w-11 shrink-0 place-items-center"
            title="Responsabilidade da equipe"
          >
            {isDone ? (
              <Check className="h-4 w-4 text-emerald-600" strokeWidth={3} />
            ) : (
              <Circle className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1 py-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p
              className={cn(
                "min-w-0 flex-[1_1_160px] text-[15px] font-semibold leading-snug",
                isDone && "text-emerald-800 dark:text-emerald-200",
              )}
            >
              {task.title}
            </p>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                isMine
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {isMine ? "Sua tarefa" : "Equipe"}
            </span>
          </div>
          {task.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
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
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
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

          {(isMine || attachments.length > 0) && (
            <div className="mt-2.5">
              <TaskAttachments
                items={attachments}
                canUpload={isMine}
                hint={isDone ? undefined : "Ex.: contrato assinado, comprovante, planilha"}
                onUpload={async (file, note) => {
                  await session.call((token) => {
                    const fd = new FormData();
                    fd.append("token", token);
                    fd.append("taskId", task.id);
                    fd.append("file", file);
                    if (note.trim()) fd.append("note", note.trim());
                    return uploadFn({ data: fd });
                  });
                  toast.success("Arquivo enviado. A equipe foi avisada.");
                  refresh();
                }}
                onOpen={async (id) =>
                  (await session.call((token) => urlFn({ data: { token, id } }))).url
                }
                onRemove={async (a) => {
                  await session.call((token) => removeFn({ data: { token, id: a.id } }));
                  toast.success("Arquivo removido da tarefa.");
                  refresh();
                }}
              />
            </div>
          )}

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
                    {c.mine ? "Você" : c.author_kind === "cliente" ? c.author : `${c.author} (equipe)`} ·{" "}
                    {new Date(c.created_at).toLocaleString("pt-BR")}
                  </p>
                  {/<[a-z][\s\S]*>/i.test(c.body) ? (
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(c.body) }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  )}
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
function NotClientCard({
  email,
  projectRef,
  teamProjectId,
}: {
  email: string | null;
  projectRef: string;
  teamProjectId?: string | null;
}) {
  async function switchAccount() {
    await portalAuth().auth.signOut();
    window.location.replace(portalLoginPath(projectRef));
  }
  if (teamProjectId) {
    return (
      <div className="space-y-3 rounded-2xl border bg-card p-6 text-sm">
        <p className="font-medium">Você é da equipe deste projeto.</p>
        <p className="text-muted-foreground">
          Você entrou como <strong>{email ?? "usuário da equipe"}</strong>. O portal é a área do
          cliente. Para executar e concluir as tarefas, abra o projeto no Core.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={`/projetos/${teamProjectId}`}>Abrir o projeto no Core</a>
          </Button>
          <Button variant="outline" onClick={switchAccount}>
            Entrar com a conta do cliente
          </Button>
        </div>
      </div>
    );
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
