import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { format, parseISO, isValid } from "date-fns";
import {
  Activity, AlertTriangle, CalendarClock, CheckCircle2, ListTodo, MessageSquare, Tag, User as UserIcon,
} from "lucide-react";
import { getClientJourney } from "@/lib/clients/clients.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { openLeadCard } from "@/components/pipeline/LeadCardHost";
import { isOverdue } from "@/lib/tasks/pending";
import { cn } from "@/lib/utils";

const KIND: Record<string, string> = { tarefa: "Tarefa", reuniao: "Reunião", call: "Ligação", follow_up: "Follow-up" };
const TEMP: Record<string, string> = { quente: "Quente", morno: "Morno", frio: "Frio" };
const TEMP_TONE: Record<string, string> = {
  quente: "bg-rose-100 text-rose-700 border-rose-200",
  morno: "bg-amber-100 text-amber-700 border-amber-200",
  frio: "bg-sky-100 text-sky-700 border-sky-200",
};

function when(iso: string | null | undefined, withTime = true) {
  if (!iso) return "—";
  const d = parseISO(iso);
  if (!isValid(d)) return "—";
  return format(d, withTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy");
}

function useJourney(clientId: string) {
  const fn = useServerFn(getClientJourney);
  return useQuery({
    queryKey: ["client-journey", clientId],
    queryFn: () => fn({ data: { clientId } }),
    staleTime: 30_000,
  });
}

/** Card(s) do lead de origem, histórico da jornada e anotações do cliente. */
export function ClientJourneyTab({ clientId }: { clientId: string }) {
  const { data, isLoading } = useJourney(clientId);
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const leads = data?.leads ?? [];
  const events = data?.events ?? [];
  const notes = data?.notes ?? [];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold"><UserIcon className="h-4 w-4" /> Card do lead</h4>
        {leads.length === 0 ? (
          <p className="text-xs text-muted-foreground">Este cliente não veio de um lead do Pipeline (cadastro direto).</p>
        ) : (
          leads.map((l: any) => (
            <div key={l.id} className="space-y-2 rounded-xl border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{l.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[l.pipeline_stages?.pipelines?.name, l.pipeline_stages?.name].filter(Boolean).join(" · ") || "Sem etapa"}
                  </p>
                </div>
                {l.temperature && (
                  <Badge variant="outline" className={cn("shrink-0 text-[10px]", TEMP_TONE[l.temperature])}>{TEMP[l.temperature] ?? l.temperature}</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {l.value != null && <span>Valor: <span className="font-medium text-foreground">{Number(l.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></span>}
                <span>Entrou em {when(l.created_at, false)}</span>
                {l.source && <span>Origem: {l.source}</span>}
              </div>
              {(l.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(l.tags as string[]).map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px]"><Tag className="h-2.5 w-2.5" />{t}</span>
                  ))}
                </div>
              )}
              <Button size="sm" className="w-full" onClick={() => openLeadCard(l.id)}>
                <UserIcon className="mr-1.5 h-4 w-4" /> Abrir cartão do lead
              </Button>
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Activity className="h-4 w-4" /> Histórico da jornada ({events.length})</h4>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem registros.</p>
        ) : (
          <ol className="space-y-3 border-l pl-4">
            {events.slice(0, 60).map((e: any) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                <p className="text-sm font-medium">{e.title}</p>
                {e.description && <p className="line-clamp-2 text-xs text-muted-foreground">{e.description}</p>}
                <p className="text-[11px] text-muted-foreground">{when(e.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {notes.length > 0 && (
        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold"><MessageSquare className="h-4 w-4" /> Anotações</h4>
          <ul className="space-y-2">
            {notes.map((n: any) => (
              <li key={n.id} className="rounded-lg bg-muted/40 p-2 text-xs">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{when(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Tarefas do cliente e agendamentos do lead de origem, pendentes primeiro. */
export function ClientTasksTab({ clientId }: { clientId: string }) {
  const { data, isLoading } = useJourney(clientId);
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  type Row = { key: string; title: string; due: string | null; done: boolean; label: string; leadId?: string; taskId?: string };
  const rows: Row[] = [
    ...(data?.leadTasks ?? []).map((t: any) => ({
      key: `lead:${t.id}`, title: t.title, due: t.due_at, done: !!t.done, label: KIND[t.kind] ?? "Agendamento", leadId: t.lead_id,
    })),
    ...(data?.tasks ?? []).map((t: any) => ({
      key: t.id, title: t.title, due: t.due_date, done: t.status === "concluido" || t.status === "cancelado", label: "Tarefa", taskId: t.id,
    })),
  ].sort((a, b) => Number(a.done) - Number(b.done) || String(a.due ?? "9999").localeCompare(String(b.due ?? "9999")));

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma tarefa ou agendamento.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const late = !r.done && isOverdue({ due_date: r.due, status: null });
        return (
          <li key={r.key} className={cn("flex items-center gap-3 rounded-xl border p-3", late ? "border-destructive/40 bg-destructive/10" : r.done ? "bg-muted/30" : "bg-card")}>
            {r.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : late ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" /> : r.leadId ? <CalendarClock className="h-4 w-4 shrink-0 text-amber-600" /> : <ListTodo className="h-4 w-4 shrink-0 text-primary" />}
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm font-medium", r.done && "text-muted-foreground line-through", late && "text-destructive")}>{r.title}</p>
              <p className="text-xs text-muted-foreground">{r.label} · {when(r.due)}{late ? " · atrasada" : ""}</p>
            </div>
            {r.leadId ? (
              <Button size="sm" variant="ghost" onClick={() => openLeadCard(r.leadId!)}>Lead</Button>
            ) : (
              <Button asChild size="sm" variant="ghost"><Link to="/tarefas" search={{ task: r.taskId, view: "lista" } as any}>Abrir</Link></Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
