import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { format, parseISO, isValid } from "date-fns";
import { AlertTriangle, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { listPriorityAlerts, ackPriorityAlerts, type PriorityAlert } from "@/lib/tasks/priority-alerts.functions";
import { alertKey, isOverdue, unackedAlerts } from "@/lib/tasks/pending";
import { LeadLink } from "@/components/pipeline/LeadCardHost";
import { AppLink } from "@/components/AppLink";
import { cn } from "@/lib/utils";

const LOCAL_KEY = "core_priority_acks";

// Reserva até a migração 21: guarda o CIENTE só neste navegador.
function readLocalAcks(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function writeLocalAcks(keys: string[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(Array.from(new Set([...readLocalAcks(), ...keys])).slice(-500)));
  } catch {
    // armazenamento bloqueado: o aviso volta na próxima visita
  }
}

/** Prioritárias pendentes do usuário (para o aviso e para o contador do menu). */
export function usePriorityAlerts() {
  const { activeOrganizationId } = useWorkspace();
  const listFn = useServerFn(listPriorityAlerts);
  const query = useQuery({
    queryKey: ["priority-alerts", activeOrganizationId ?? "none"],
    queryFn: () => listFn({ data: { organizationId: activeOrganizationId! } }),
    enabled: !!activeOrganizationId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  return { ...query, organizationId: activeOrganizationId, count: query.data?.items.length ?? 0 };
}

function dueLabel(due: string | null) {
  if (!due) return "Sem prazo";
  const d = parseISO(due);
  if (!isValid(d)) return "Sem prazo";
  const allDay = /T00:00(:00(\.0+)?)?(Z|\+00:?00)?$/.test(due);
  return allDay ? `${due.slice(8, 10)}/${due.slice(5, 7)}` : format(d, "dd/MM · HH:mm");
}

/**
 * Aviso flutuante no canto inferior direito, ao abrir o sistema, com as tarefas
 * Alta/Urgente que ainda não receberam CIENTE.
 */
export function PriorityAlertModal() {
  const qc = useQueryClient();
  const { data, organizationId } = usePriorityAlerts();
  const ackFn = useServerFn(ackPriorityAlerts);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const pending = useMemo<PriorityAlert[]>(() => {
    if (!data) return [];
    const acked = [...data.acked, ...dismissed, ...(data.acksAvailable ? [] : readLocalAcks())];
    return unackedAlerts(data.items, acked);
  }, [data, dismissed]);

  const ack = useMutation({
    mutationFn: async (items: PriorityAlert[]) => {
      const keys = items.map(alertKey);
      setDismissed((d) => [...d, ...keys]);
      if (!data?.acksAvailable || !organizationId) {
        writeLocalAcks(keys);
        return;
      }
      const res = await ackFn({ data: { organizationId, items: items.map((i) => ({ source: i.source, id: i.id })) } });
      if (!res.stored) writeLocalAcks(keys);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["priority-alerts"] }),
  });

  if (pending.length === 0) return null;
  const shown = pending.slice(0, 5);

  return (
    <div
      role="alertdialog"
      aria-labelledby="priority-alert-title"
      className="fixed bottom-4 right-4 z-[60] w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-destructive/30 bg-background shadow-2xl animate-in slide-in-from-bottom-4 fade-in"
    >
      <div className="flex items-center gap-2 bg-destructive px-4 py-3 text-destructive-foreground">
        <BellRing className="h-4 w-4 shrink-0" />
        <p id="priority-alert-title" className="text-sm font-semibold">
          {pending.length === 1 ? "Você tem 1 tarefa prioritária" : `Você tem ${pending.length} tarefas prioritárias`}
        </p>
      </div>
      <ul className="max-h-[50vh] space-y-2 overflow-y-auto p-3">
        {shown.map((i) => {
          const late = isOverdue({ due_date: i.due, status: null });
          return (
            <li key={alertKey(i)} className={cn("rounded-xl border p-3", late ? "border-destructive/40 bg-destructive/10" : "bg-card")}>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold">{i.title}</p>
                <span className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                  i.priority === "critica" ? "bg-destructive text-destructive-foreground" : "bg-orange-100 text-orange-700",
                )}>
                  {i.priority === "critica" ? "Urgente" : "Alta"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className={cn("tabular-nums", late && "font-medium text-destructive")}>
                  {late && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                  {dueLabel(i.due)}{late ? " · atrasada" : ""}
                </span>
                {i.leadId && i.leadName && <LeadLink leadId={i.leadId} name={i.leadName} />}
                {i.source === "task" && i.projectId && (
                  <AppLink href={`/projetos/${i.projectId}?aba=etapas&tarefa=${i.id}`} className="font-medium text-primary hover:underline">
                    Abrir na etapa do projeto
                  </AppLink>
                )}
              </div>
            </li>
          );
        })}
        {pending.length > shown.length && (
          <li className="px-1 text-xs text-muted-foreground">+{pending.length - shown.length} outras</li>
        )}
      </ul>
      <div className="flex items-center gap-2 border-t p-3">
        <Button asChild variant="ghost" size="sm" className="flex-1">
          <Link to="/tarefas" search={{ prioridade: 1 } as any} onClick={() => ack.mutate(pending)}>Ver prioridades</Link>
        </Button>
        <Button size="sm" className="flex-1 font-bold tracking-wide" onClick={() => ack.mutate(pending)} disabled={ack.isPending}>
          CIENTE
        </Button>
      </div>
    </div>
  );
}
