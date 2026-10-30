import { useMemo, useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  format, isSameMonth, isSameDay, parseISO, isValid,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, CalendarCheck, ListTodo, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { dueDayKey, isDoneStatus, isOverdue, isPriorityLevel } from "@/lib/tasks/pending";

type CalTask = {
  id: string;
  title: string;
  due_date: string | null;
  briefing?: any;
  priority?: string;
  status?: string;
  leadTask?: { leads: { name: string } };
};

interface Props {
  tasks: CalTask[];
  onSelectTask: (id: string) => void;
  onCreateAt: (dateISO: string) => void;
  /** Clique no dia: abre o painel com as pendências daquele dia. */
  onPickDay?: (day: Date) => void;
}

function isMeeting(t: CalTask) {
  return (t.briefing as any)?.type === "reuniao";
}

function chipClass(t: CalTask) {
  const done = isDoneStatus(t.status);
  if (!done && isOverdue({ due_date: t.due_date, status: t.status })) {
    return "bg-destructive text-destructive-foreground font-semibold shadow-sm";
  }
  if (done) return "bg-muted text-muted-foreground line-through";
  return isMeeting(t) ? "bg-indigo-100 text-indigo-800" : "bg-emerald-100 text-emerald-800";
}

export function TaskCalendarView({ tasks, onSelectTask, onCreateAt, onPickDay }: Props) {
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState(() => new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, CalTask[]>();
    for (const t of tasks) {
      const key = dueDayKey(t.due_date);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    // atrasadas e prioritárias primeiro dentro do dia
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const oa = isOverdue({ due_date: a.due_date, status: a.status }) ? 0 : 1;
        const ob = isOverdue({ due_date: b.due_date, status: b.status }) ? 0 : 1;
        if (oa !== ob) return oa - ob;
        const pa = isPriorityLevel(a.priority) ? 0 : 1;
        const pb = isPriorityLevel(b.priority) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return (a.due_date ?? "").localeCompare(b.due_date ?? "");
      });
    }
    return map;
  }, [tasks]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const overdueTotal = useMemo(
    () => tasks.filter((t) => isOverdue({ due_date: t.due_date, status: t.status })).length,
    [tasks],
  );

  const pickDay = (d: Date) => (onPickDay ? onPickDay(d) : onCreateAt(format(d, "yyyy-MM-dd")));

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold capitalize">
          {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
        </h2>
        {overdueTotal > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2.5 py-0.5 text-xs font-semibold text-destructive-foreground">
            <AlertTriangle className="h-3 w-3" /> {overdueTotal} atrasada{overdueTotal === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-8" onClick={() => setCursor(new Date())}>
          Hoje
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Mês anterior" onClick={() => setCursor((c) => addMonths(c, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Próximo mês" onClick={() => setCursor((c) => addMonths(c, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  // Celular: lista dos dias com pendências; tocar no dia abre o painel do dia.
  if (isMobile) {
    const monthDays = days.filter((d) => isSameMonth(d, cursor));
    const daysWithEvents = monthDays.filter((d) => (byDay.get(format(d, "yyyy-MM-dd")) ?? []).length > 0);
    return (
      <div>
        {header}
        {daysWithEvents.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma tarefa ou reunião neste mês.
          </div>
        )}
        <div className="space-y-4">
          {daysWithEvents.map((d) => {
            const items = byDay.get(format(d, "yyyy-MM-dd")) ?? [];
            const overdue = items.filter((t) => isOverdue({ due_date: t.due_date, status: t.status })).length;
            return (
              <div key={d.toISOString()}>
                <div className="mb-2 flex items-center justify-between">
                  <button onClick={() => pickDay(d)} className="flex min-h-[44px] items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                    {format(d, "EEE, dd 'de' MMM", { locale: ptBR })}
                    {overdue > 0 && (
                      <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">{overdue} atrasada{overdue === 1 ? "" : "s"}</span>
                    )}
                  </button>
                  <button onClick={() => onCreateAt(format(d, "yyyy-MM-dd"))} className="text-xs font-medium text-[var(--brand-dark)] dark:text-primary">
                    + Adicionar
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {items.map((t) => {
                    const late = isOverdue({ due_date: t.due_date, status: t.status });
                    return (
                      <li
                        key={t.id}
                        onClick={() => onSelectTask(t.id)}
                        className={cn(
                          "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm active:scale-[0.99]",
                          late ? "border-destructive/50 bg-destructive/10 text-destructive" : "bg-card",
                        )}
                      >
                        {late ? (
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                        ) : isMeeting(t) ? (
                          <CalendarCheck className="h-4 w-4 shrink-0 text-indigo-500" />
                        ) : (
                          <ListTodo className="h-4 w-4 shrink-0 text-[var(--brand-dark)] dark:text-primary" />
                        )}
                        <span className="flex-1 truncate">{t.title}</span>
                        {t.due_date && isValid(parseISO(t.due_date)) && (
                          <span className="text-xs tabular-nums opacity-70">{format(parseISO(t.due_date), "HH:mm")}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Computador: grade do mês
  const weekLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return (
    <div>
      {header}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {weekLabels.map((l) => (
          <div key={l} className="bg-muted px-2 py-1.5 text-center text-[11px] font-medium uppercase text-muted-foreground">
            {l}
          </div>
        ))}
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const items = byDay.get(key) ?? [];
          const inMonth = isSameMonth(d, cursor);
          const isToday = isSameDay(d, new Date());
          const overdue = items.filter((t) => isOverdue({ due_date: t.due_date, status: t.status })).length;
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => pickDay(d)}
              onKeyDown={(e) => { if (e.key === "Enter") pickDay(d); }}
              aria-label={`Pendências de ${format(d, "dd/MM")}`}
              className={cn(
                "group relative min-h-[110px] cursor-pointer bg-card p-1.5 transition-colors hover:bg-muted/40",
                !inMonth && "bg-muted/30 text-muted-foreground",
                overdue > 0 && "ring-1 ring-inset ring-destructive/40",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {format(d, "d")}
                </span>
                <div className="flex items-center gap-1">
                  {overdue > 0 && (
                    <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground" title={`${overdue} atrasada(s)`}>
                      {overdue}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onCreateAt(key); }}
                    className="flex h-5 w-5 items-center justify-center rounded opacity-0 hover:bg-accent group-hover:opacity-100"
                    title="Adicionar aqui"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <ul className="space-y-1">
                {items.slice(0, 3).map((t) => (
                  <li
                    key={t.id}
                    onClick={(e) => { e.stopPropagation(); onSelectTask(t.id); }}
                    className={cn("cursor-pointer truncate rounded px-1.5 py-0.5 text-[11px] hover:opacity-80", chipClass(t))}
                    title={t.leadTask ? `${t.title} · Lead ${t.leadTask.leads.name}` : t.title}
                  >
                    {isPriorityLevel(t.priority) && !isDoneStatus(t.status) && "● "}
                    {t.title}
                  </li>
                ))}
                {items.length > 3 && (
                  <li className="pl-1 text-[10px] text-muted-foreground">+{items.length - 3} mais</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
