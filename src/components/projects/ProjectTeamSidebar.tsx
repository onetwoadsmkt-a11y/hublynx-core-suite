import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProjectAccess, ROLE_INFO } from "@/components/projects/ProjectTeamPanel";
import { resendTeamInvite, type ProjectMemberRow } from "@/lib/projects/access.functions";
import { listProjectStageTasks } from "@/lib/projects/stages.functions";

const initials = (s: string) =>
  s
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

/**
 * Computador: equipe ao lado do histórico — cliente com "Reenviar acesso" e cada pessoa
 * com papel/departamento e a situação das suas tarefas (atrasadas, em dia).
 */
export function ProjectTeamSidebar({ projectId, onOpenTeam }: { projectId: string; onOpenTeam: () => void }) {
  const accessQ = useProjectAccess(projectId);
  const tasksFn = useServerFn(listProjectStageTasks);
  const tasksQ = useQuery({
    queryKey: ["project-stage-tasks", projectId],
    queryFn: () => tasksFn({ data: { project_id: projectId } }),
    staleTime: 60_000,
  });
  const resendFn = useServerFn(resendTeamInvite);
  const resendM = useMutation({
    mutationFn: (m: ProjectMemberRow) => resendFn({ data: { id: m.id } }),
    onSuccess: (r) => {
      if (r.emailSent) toast.success(`Acesso do Core reenviado para ${r.email}`);
      else toast.error(`Não foi possível enviar o e-mail: ${r.emailError ?? "erro desconhecido"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const load = useMemo(() => {
    const today = new Date(new Date().toDateString()).getTime();
    const m = new Map<string, { open: number; late: number }>();
    for (const t of tasksQ.data ?? []) {
      if (!t.assignee_id || t.status === "concluido") continue;
      const cur = m.get(t.assignee_id) ?? { open: 0, late: 0 };
      cur.open += 1;
      if (t.due_date && new Date(new Date(t.due_date).toDateString()).getTime() < today) cur.late += 1;
      m.set(t.assignee_id, cur);
    }
    return m;
  }, [tasksQ.data]);

  const a = accessQ.data;
  const members = a?.members ?? [];
  const clients = members.filter((m) => m.access_role === "cliente");
  const staff = members.filter((m) => m.access_role !== "cliente");

  return (
    <aside
      aria-label="Equipe do projeto"
      className="mt-4 hidden space-y-2.5 rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(10,37,87,.06),0_10px_28px_rgba(10,37,87,.07)] sm:mt-5 lg:sticky lg:top-4 lg:block"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[17px] font-extrabold">Equipe {a ? `(${members.length})` : ""}</h3>
        {a?.canManage && (
          <Button size="sm" className="h-9 rounded-lg" onClick={onOpenTeam}>
            <UserPlus className="h-4 w-4" /> Pessoa
          </Button>
        )}
      </div>
      {accessQ.isLoading && <p className="text-sm text-muted-foreground">Carregando equipe…</p>}
      {accessQ.isError && <p className="text-sm text-rose-600">Não foi possível carregar a equipe.</p>}
      {clients.map((m) => {
        const name = m.name || m.email || "Cliente";
        return (
          <div key={m.id} className="flex items-center gap-2.5 rounded-xl bg-amber-50/70 p-2.5 ring-1 ring-amber-200 dark:bg-amber-500/10">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-extrabold text-amber-900">{initials(name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{name}</p>
              <p className="text-xs text-muted-foreground">Cliente · portal</p>
            </div>
            {a?.canManage && m.email && (
              <Button variant="outline" size="sm" className="h-8 border-amber-300 px-2 text-xs text-amber-900" onClick={onOpenTeam}>
                Reenviar acesso
              </Button>
            )}
          </div>
        );
      })}
      {staff.map((m) => {
        const name = m.name || m.email || "Sem nome";
        const l = m.user_id ? load.get(m.user_id) : undefined;
        const role = ROLE_INFO[m.access_role]?.label ?? m.access_role;
        const busy = resendM.isPending && resendM.variables?.id === m.id;
        return (
          <div key={m.id} className="group flex items-center gap-2.5 rounded-xl p-2.5 hover:bg-muted/50">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">{initials(name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{[m.role, role].filter(Boolean).join(" · ")}</p>
            </div>
            {l && l.late > 0 ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">{l.late} atrasada{l.late > 1 ? "s" : ""}</span>
            ) : l ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">em dia</span>
            ) : null}
            {a?.canManage && m.user_id && m.email && (
              <button
                type="button"
                onClick={() => resendM.mutate(m)}
                disabled={busy}
                className={cn("grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground", !busy && "opacity-0 focus:opacity-100 group-hover:opacity-100")}
                aria-label={`Reenviar acesso para ${name}`}
                title="Reenviar acesso"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            )}
          </div>
        );
      })}
      <button type="button" onClick={onOpenTeam} className="block w-full pt-1 text-center text-[13px] font-bold text-primary hover:underline">
        Abrir Equipe e permissões
      </button>
    </aside>
  );
}
