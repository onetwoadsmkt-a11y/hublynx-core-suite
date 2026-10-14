import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Circle, MessageSquare, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { PortalShell, usePortalSession } from "@/components/portal/PortalShell";
import { supabase } from "@/integrations/supabase/client";
import { rememberNext } from "@/lib/auth-redirect";
import {
  portalAddComment,
  portalProject,
  portalStaffLookup,
  portalSetTaskDone,
  type PortalStage,
  type PortalTask,
} from "@/lib/portal/portal.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal/$projectId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Projeto — Portal do cliente" }] }),
  component: PortalProjectPage,
});

function fmtDate(d?: string | null) {
  if (!d) return null;
  const dt = d.length <= 10 ? new Date(`${d}T12:00:00`) : new Date(d);
  return dt.toLocaleDateString("pt-BR");
}

const STATUS_LABEL: Record<string, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  em_revisao: "Em revisão",
  concluido: "Concluída",
};

function PortalProjectPage() {
  const { projectId } = Route.useParams();
  const session = usePortalSession();
  const qc = useQueryClient();
  const getFn = useServerFn(portalProject);
  const doneFn = useServerFn(portalSetTaskDone);
  const q = useQuery({
    queryKey: ["portal-project", projectId],
    queryFn: () => getFn({ data: { projectId } }),
    enabled: session.ready,
    refetchInterval: 30_000,
  });

  const toggle = useMutation({
    mutationFn: (v: { taskId: string; done: boolean }) => doneFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.done ? "Tarefa concluída. A equipe foi avisada." : "Tarefa reaberta.");
      qc.invalidateQueries({ queryKey: ["portal-project", projectId] });
      qc.invalidateQueries({ queryKey: ["portal-projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = q.data;
  const stages = d?.stages ?? [];
  const tasks = d?.tasks ?? [];
  const byStage = useMemo(() => {
    const m = new Map<string, PortalTask[]>();
    for (const t of tasks) {
      const k = t.stage_id ?? "_";
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  }, [tasks]);

  const mine = tasks.filter((t) => t.responsible_type === "cliente");
  const mineOpen = mine.filter((t) => t.status !== "concluido").length;
  const progress = stages.length
    ? Math.round(stages.reduce((a, s) => a + (s.percent ?? 0), 0) / stages.length)
    : 0;
  const currentIdx = stages.findIndex((s) => s.status !== "done");

  return (
    <PortalShell brand={d?.organization} email={session.email}>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link to="/portal">
          <ArrowLeft className="h-4 w-4" /> Meus projetos
        </Link>
      </Button>

      {!session.ready || q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : q.isError || !d ? (
        <NotClientCard projectRef={projectId} email={session.email} />
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{d.project.name}</h1>
            {d.project.description && (
              <p className="mt-1 text-sm text-muted-foreground">{d.project.description}</p>
            )}
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-muted-foreground">
                  {stages.filter((s) => s.status === "done").length} de {stages.length} etapas
                  concluídas
                </span>
                <span className="font-semibold tabular-nums">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2.5" />
            </div>
            {mineOpen > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                Você tem <strong>{mineOpen}</strong> pendência(s). Marque cada uma quando concluir —
                a equipe acompanha em tempo real.
              </p>
            )}
          </Card>

          {/* Roadmap */}
          <div className="space-y-3">
            {stages.map((s, i) => (
              <StageBlock
                key={s.id}
                stage={s}
                index={i}
                current={i === currentIdx}
                tasks={byStage.get(s.id) ?? []}
                onToggle={(taskId, done) => toggle.mutate({ taskId, done })}
                pending={toggle.isPending}
                projectId={projectId}
              />
            ))}
            {(byStage.get("_") ?? []).length > 0 && (
              <StageBlock
                stage={{
                  id: "_",
                  name: "Outras tarefas",
                  status: "in_progress",
                  percent: 0,
                  start_date: null,
                  due_date: null,
                }}
                index={stages.length}
                current={false}
                tasks={byStage.get("_") ?? []}
                onToggle={(taskId, done) => toggle.mutate({ taskId, done })}
                pending={toggle.isPending}
                projectId={projectId}
                hideProgress
              />
            )}
          </div>

          {d.team.length > 0 && (
            <Card className="p-5">
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
            </Card>
          )}
        </div>
      )}
    </PortalShell>
  );
}

function StageBlock({
  stage,
  index,
  current,
  tasks,
  onToggle,
  pending,
  projectId,
  hideProgress = false,
}: {
  stage: PortalStage;
  index: number;
  current: boolean;
  tasks: PortalTask[];
  onToggle: (taskId: string, done: boolean) => void;
  pending: boolean;
  projectId: string;
  hideProgress?: boolean;
}) {
  const done = stage.status === "done";
  const ordered = [...tasks].sort(
    (a, b) => Number(a.status === "concluido") - Number(b.status === "concluido"),
  );
  return (
    <Card className={cn("p-4 sm:p-5", current && "border-primary/50 ring-2 ring-primary/10")}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold",
            done
              ? "border-primary bg-primary text-primary-foreground"
              : current
                ? "border-primary text-primary"
                : "text-muted-foreground",
          )}
        >
          {done ? <Check className="h-4 w-4" /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{stage.name}</h3>
            {current && (
              <Badge variant="secondary" className="text-[10px]">
                Etapa atual
              </Badge>
            )}
          </div>
          {(stage.start_date || stage.due_date) && (
            <p className="text-xs text-muted-foreground">
              {fmtDate(stage.start_date) ?? "—"} → {fmtDate(stage.due_date) ?? "—"}
            </p>
          )}
        </div>
        {!hideProgress && (
          <span className="text-sm font-semibold tabular-nums">{stage.percent ?? 0}%</span>
        )}
      </div>

      {ordered.length > 0 && (
        <ul className="mt-4 space-y-2">
          {ordered.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onToggle={onToggle}
              pending={pending}
              projectId={projectId}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function TaskRow({
  task,
  onToggle,
  pending,
  projectId,
}: {
  task: PortalTask;
  onToggle: (taskId: string, done: boolean) => void;
  pending: boolean;
  projectId: string;
}) {
  const qc = useQueryClient();
  const commentFn = useServerFn(portalAddComment);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const isMine = task.responsible_type === "cliente";
  const isDone = task.status === "concluido";
  const overdue =
    !isDone && task.due_date && new Date(task.due_date) < new Date(new Date().toDateString());

  const send = useMutation({
    mutationFn: () => commentFn({ data: { taskId: task.id, body } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["portal-project", projectId] });
      toast.success("Comentário enviado à equipe.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li
      className={cn(
        "rounded-xl border bg-background p-3",
        isMine && !isDone && "border-amber-300/70",
      )}
    >
      <div className="flex items-start gap-3">
        {isMine ? (
          <Checkbox
            className="mt-0.5 h-5 w-5"
            checked={isDone}
            disabled={pending}
            onCheckedChange={(v) => onToggle(task.id, v === true)}
            aria-label={isDone ? "Reabrir tarefa" : "Marcar como concluída"}
          />
        ) : (
          <span
            className="mt-0.5 grid h-5 w-5 place-items-center text-muted-foreground"
            title="Responsabilidade da equipe"
          >
            {isDone ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", isDone && "text-muted-foreground line-through")}>
            {task.title}
          </p>
          {task.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
            <Badge
              variant="outline"
              className={cn("h-5 text-[10px]", isMine ? "border-amber-300 text-amber-700" : "")}
            >
              {isMine ? "Sua responsabilidade" : "Equipe"}
            </Badge>
            {!isMine && (
              <span className="text-muted-foreground">
                {STATUS_LABEL[task.status] ?? task.status}
              </span>
            )}
            {task.due_date && (
              <span className={cn("text-muted-foreground", overdue && "font-medium text-rose-600")}>
                Prazo {fmtDate(task.due_date)}
                {overdue ? " (atrasada)" : ""}
              </span>
            )}
            {isDone && task.completed_at && (
              <span className="text-emerald-700">Concluída em {fmtDate(task.completed_at)}</span>
            )}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {task.comments.length > 0 ? `${task.comments.length} comentário(s)` : "Comentar"}
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
                  aria-label="Enviar comentário"
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

/** O link é do portal do cliente, mas quem entrou não é o cliente deste projeto. */
function NotClientCard({ projectRef, email }: { projectRef: string; email: string | null }) {
  const lookupFn = useServerFn(portalStaffLookup);
  const q = useQuery({
    queryKey: ["portal-staff-lookup", projectRef],
    queryFn: () => lookupFn({ data: { projectId: projectRef } }),
  });
  async function switchAccount() {
    rememberNext(`/portal/${projectRef}`);
    await supabase.auth.signOut();
    window.location.replace("/auth");
  }
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const staffId = q.data?.projectId ?? null;
  return (
    <Card className="space-y-3 p-6 text-sm">
      <p className="font-medium">Este é o link do portal do cliente.</p>
      <p className="text-muted-foreground">
        Você entrou como <strong>{email ?? "outro usuário"}</strong>, que não é o cliente deste
        projeto.
        {staffId
          ? " Como você faz parte da equipe, abra o projeto no Core."
          : " Entre com o e-mail e a senha que o cliente recebeu no convite."}
      </p>
      <div className="flex flex-wrap gap-2">
        {staffId && (
          <Button asChild>
            <a href={`/projetos/${staffId}`}>Abrir o projeto no Core</a>
          </Button>
        )}
        <Button variant={staffId ? "outline" : "default"} onClick={switchAccount}>
          Sair e entrar como cliente
        </Button>
      </div>
    </Card>
  );
}
