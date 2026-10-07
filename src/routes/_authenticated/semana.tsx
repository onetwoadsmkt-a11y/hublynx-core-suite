import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarDays, Check, KanbanSquare, List, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { scopeOrganization } from "@/lib/org/filter";
import { maskBRL, useValuesUnlocked } from "@/lib/security/value-lock";
import { getWeekOverview, setTaskDone, type WeekItem } from "@/lib/week/week.functions";
import { syncEntityToSheets } from "@/lib/google/sheets-sync.functions";
import { syncTaskToCalendar } from "@/lib/google/calendar.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/semana")({
  head: () => ({ meta: [{ title: "Minha semana — Hublynx" }] }),
  component: MinhaSemana,
});

const NO_CLIENT = "__none__";

function todayLocalISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Datas à meia-noite UTC são "dia inteiro": mostra a data gravada, sem converter fuso. */
function fmtDue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const allDay = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
  if (allDay) return d.toLocaleDateString("pt-BR", { ...opts, timeZone: "UTC" });
  return `${d.toLocaleDateString("pt-BR", opts)} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function MinhaSemana() {
  const qc = useQueryClient();
  const { activeOrganizationId } = useWorkspace();
  useValuesUnlocked(); // re-renderiza quando o cadeado de valores muda
  const fetchWeek = useServerFn(getWeekOverview);
  const markDone = useServerFn(setTaskDone);
  const syncSheet = useServerFn(syncEntityToSheets);
  const syncCalendar = useServerFn(syncTaskToCalendar);

  const queryKey = ["week-overview", activeOrganizationId];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      fetchWeek({
        data: {
          organizationId: activeOrganizationId,
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        },
      }),
    staleTime: 30_000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["week-clients", activeOrganizationId],
    queryFn: async () => {
      const { data: rows } = await scopeOrganization(
        supabase.from("clients").select("id, name").order("name"),
        activeOrganizationId,
      );
      return (rows ?? []) as { id: string; name: string }[];
    },
    staleTime: 5 * 60_000,
  });

  // Itens marcados nesta sessão ficam riscados até a próxima atualização.
  const [doneIds, setDoneIds] = useState<Record<string, boolean>>({});
  const toggle = useMutation({
    mutationFn: async (it: WeekItem) => {
      const done = !doneIds[it.id];
      setDoneIds((s) => ({ ...s, [it.id]: done }));
      await markDone({ data: { id: it.id, source: it.source, done } });
      return done;
    },
    onSuccess: (done) => {
      if (done) toast.success("Concluída.");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["hub-today"] });
    },
    onError: (e: any, it) => {
      setDoneIds((s) => ({ ...s, [it.id]: !s[it.id] }));
      toast.error(e.message);
    },
  });

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(NO_CLIENT);
  const [due, setDue] = useState(todayLocalISO());
  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { data: inserted, error: err } = await supabase
        .from("tasks")
        .insert({
          owner_id: u.user.id,
          ...(activeOrganizationId ? { organization_id: activeOrganizationId } : {}),
          title: title.trim(),
          priority: "media",
          status: "a_fazer",
          client_id: clientId === NO_CLIENT ? null : clientId,
          due_date: due ? new Date(`${due}T00:00:00Z`).toISOString() : null,
          position: 0,
          briefing: { type: "tarefa" } as any,
        } as never)
        .select("id")
        .single();
      if (err) throw err;
      return inserted.id as string;
    },
    onSuccess: (id) => {
      setTitle("");
      toast.success("Tarefa criada.");
      qc.invalidateQueries({ queryKey: ["week-overview"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      syncSheet({ data: { entityType: "task", recordId: id } }).catch(() => {});
      if (due) syncCalendar({ data: { taskId: id, withMeet: false } }).catch(() => {});
    },
    onError: (e: any) => toast.error(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim() && !create.isPending) create.mutate();
  };

  const groups = useMemo(
    () =>
      data
        ? [
            {
              key: "overdue",
              label: "Atrasadas",
              items: data.overdue,
              tone: "late" as const,
              empty: "Nada atrasado.",
            },
            {
              key: "today",
              label: "Hoje",
              items: data.today,
              tone: "normal" as const,
              empty: "Nada marcado para hoje.",
            },
            {
              key: "week",
              label: "Esta semana",
              items: data.week,
              tone: "normal" as const,
              empty: "Nada até domingo.",
            },
            {
              key: "later",
              label: "Mais adiante",
              items: data.later,
              tone: "normal" as const,
              empty: "Nada agendado depois desta semana.",
            },
            ...(data.noDate.length
              ? [
                  {
                    key: "nodate",
                    label: "Sem data",
                    items: data.noDate,
                    tone: "normal" as const,
                    empty: "",
                  },
                ]
              : []),
          ]
        : [],
    [data],
  );

  const lateOpen = data ? data.overdue.filter((i) => !doneIds[i.id]).length : 0;
  const todayOpen = data ? data.today.filter((i) => !doneIds[i.id]).length : 0;
  const dateLabel = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium capitalize text-muted-foreground">{dateLabel}</span>
          <h1 className="text-3xl font-semibold tracking-tight">Minha semana</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-destructive/10 px-3.5 py-1.5 text-sm font-semibold text-destructive">
            {lateOpen} atrasadas
          </span>
          <span className="rounded-full border bg-card px-3.5 py-1.5 text-sm font-semibold">
            {todayOpen} para hoje
          </span>
          <nav aria-label="Visualização" className="ml-1 flex rounded-xl border bg-card p-1">
            <span className="flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-semibold text-background">
              <List className="h-4 w-4" /> Lista
            </span>
            <Link
              to="/tarefas"
              search={{ view: "kanban" }}
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              <KanbanSquare className="h-4 w-4" /> Kanban
            </Link>
            <Link
              to="/agenda"
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              <CalendarDays className="h-4 w-4" /> Calendário
            </Link>
          </nav>
        </div>
      </div>

      <Card className="p-3">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <label htmlFor="nova-tarefa" className="sr-only">
            Nova tarefa
          </label>
          <Input
            id="nova-tarefa"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nova tarefa… e aperte Enter"
            className="h-12 min-w-0 flex-[999_1_260px] rounded-xl border-0 bg-muted/60 px-4 text-base shadow-none focus-visible:ring-1"
          />
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger
              className="h-12 w-auto min-w-[150px] flex-1 rounded-xl"
              aria-label="Cliente"
            >
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CLIENT}>Sem cliente</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label htmlFor="nova-data" className="sr-only">
            Data
          </label>
          <Input
            id="nova-data"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="h-12 w-auto flex-1 rounded-xl"
          />
          <Button
            type="submit"
            className="h-12 rounded-xl px-6 font-semibold"
            disabled={!title.trim() || create.isPending}
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </form>
      </Card>

      {error ? (
        <Card className="p-6 text-sm text-destructive">
          Não foi possível carregar: {(error as Error).message}
        </Card>
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_460px] flex-col gap-5">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="h-36 animate-pulse" />
              ))
            : groups.map((g) => (
                <Card key={g.key} className="overflow-hidden">
                  <div className="flex items-center justify-between px-5 pb-2 pt-4">
                    <h2
                      className={cn(
                        "text-[17px] font-semibold",
                        g.tone === "late" && "text-destructive",
                      )}
                    >
                      {g.label}
                    </h2>
                    <span className="text-sm font-semibold text-muted-foreground">
                      {g.items.length}
                    </span>
                  </div>
                  {g.items.length === 0 ? (
                    <p className="px-5 pb-5 text-sm text-muted-foreground">{g.empty}</p>
                  ) : (
                    <ul>
                      {g.items.map((it) => (
                        <TaskRow
                          key={`${it.source}-${it.id}`}
                          item={it}
                          late={g.tone === "late"}
                          done={!!doneIds[it.id]}
                          onToggle={() => toggle.mutate(it)}
                        />
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
        </div>

        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-5">
          {data?.receivablesOverdue && data.receivablesOverdue.count > 0 ? (
            <Link to="/financeiro/receber" className="block">
              <Card className="flex flex-col gap-1.5 p-5 transition-colors hover:bg-muted/30">
                <span className="text-sm font-semibold text-destructive">A receber vencido</span>
                <span className="text-3xl font-semibold tracking-tight">
                  {maskBRL(data.receivablesOverdue.total, { maximumFractionDigits: 0 })}
                </span>
                <span className="text-sm text-muted-foreground">
                  {data.receivablesOverdue.count}{" "}
                  {data.receivablesOverdue.count === 1 ? "cobrança" : "cobranças"} · ver no
                  Financeiro →
                </span>
              </Card>
            </Link>
          ) : null}

          {data && data.staleProjects.length > 0 ? (
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[17px] font-semibold">Sem próxima ação</h2>
                <span className="text-sm font-semibold text-[#7A4B00] dark:text-warning">
                  {data.staleProjects.length}{" "}
                  {data.staleProjects.length === 1 ? "projeto" : "projetos"}
                </span>
              </div>
              <p className="-mt-2 text-sm text-muted-foreground">
                Ativos, mas sem nenhuma tarefa aberta.
              </p>
              <ul className="flex flex-col">
                {data.staleProjects.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/projetos/$id"
                      params={{ id: p.id }}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/50"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{p.name}</span>
                        {p.clientName ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {p.clientName}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-primary">+ Ação</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  item,
  late,
  done,
  onToggle,
}: {
  item: WeekItem;
  late: boolean;
  done: boolean;
  onToggle: () => void;
}) {
  const isLead = item.source === "lead";
  const titleNode = (
    <span
      className={cn(
        "block truncate text-[15px] font-semibold",
        done && "text-muted-foreground line-through",
      )}
    >
      {item.title}
    </span>
  );
  return (
    <li className="flex items-center gap-2 border-t border-border/60 py-1.5 pl-2 pr-5 hover:bg-muted/30">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${done ? "Reabrir" : "Concluir"}: ${item.title}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
      >
        <span
          className={cn(
            "flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 transition-colors",
            done
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 hover:border-primary",
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {isLead ? (
          <Link to="/pipeline" className="min-w-0 hover:underline">
            {titleNode}
          </Link>
        ) : (
          <Link to="/tarefas" search={{ task: item.id }} className="min-w-0 hover:underline">
            {titleNode}
          </Link>
        )}
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              isLead
                ? "bg-[oklch(0.94_0.04_295)] text-[oklch(0.38_0.16_295)] dark:bg-[oklch(0.32_0.08_295)] dark:text-[oklch(0.88_0.06_295)]"
                : "bg-accent text-accent-foreground",
            )}
          >
            {isLead ? "Lead" : (item.clientName ?? "Sem cliente")}
          </span>
          {item.context ? <span className="truncate">{item.context}</span> : null}
        </span>
      </div>
      <span
        className={cn(
          "shrink-0 text-[13px] font-semibold",
          late && !done ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {fmtDue(item.due)}
      </span>
    </li>
  );
}
