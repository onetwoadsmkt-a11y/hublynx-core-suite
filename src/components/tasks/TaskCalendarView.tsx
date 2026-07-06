import { useMemo, useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  format, isSameMonth, isSameDay, parseISO, isValid,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, CalendarCheck, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

type CalTask = {
  id: string;
  title: string;
  due_date: string | null;
  briefing?: any;
  priority?: string;
  status?: string;
};

interface Props {
  tasks: CalTask[];
  onSelectTask: (id: string) => void;
  onCreateAt: (dateISO: string) => void;
}

function isMeeting(t: CalTask) {
  return (t.briefing as any)?.type === "reuniao";
}

export function TaskCalendarView({ tasks, onSelectTask, onCreateAt }: Props) {
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState(() => new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, CalTask[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const d = parseISO(t.due_date);
      if (!isValid(d)) continue;
      const key = format(d, "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const header = (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-semibold capitalize">
        {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
      </h2>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor(new Date())}>
          <span className="text-xs font-medium">Hoje</span>
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor((c) => addMonths(c, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor((c) => addMonths(c, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  // Mobile: agenda list
  if (isMobile) {
    const monthDays = days.filter((d) => isSameMonth(d, cursor));
    const daysWithEvents = monthDays.filter((d) => (byDay.get(format(d, "yyyy-MM-dd")) ?? []).length > 0);
    return (
      <div>
        {header}
        {daysWithEvents.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-10">
            Nenhuma tarefa ou reunião neste mês.
          </div>
        )}
        <div className="space-y-4">
          {daysWithEvents.map((d) => {
            const items = byDay.get(format(d, "yyyy-MM-dd")) ?? [];
            return (
              <div key={d.toISOString()}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {format(d, "EEE, dd 'de' MMM", { locale: ptBR })}
                  </p>
                  <button
                    onClick={() => onCreateAt(format(d, "yyyy-MM-dd"))}
                    className="text-xs text-[#00D084] font-medium"
                  >
                    + Adicionar
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {items.map((t) => (
                    <li
                      key={t.id}
                      onClick={() => onSelectTask(t.id)}
                      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm cursor-pointer active:scale-[0.99]"
                    >
                      {isMeeting(t) ? (
                        <CalendarCheck className="h-4 w-4 text-indigo-500 shrink-0" />
                      ) : (
                        <ListTodo className="h-4 w-4 text-[#00D084] shrink-0" />
                      )}
                      <span className="flex-1 truncate">{t.title}</span>
                      {t.due_date && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {format(parseISO(t.due_date), "HH:mm")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop: month grid
  const weekLabels = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return (
    <div>
      {header}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border">
        {weekLabels.map((l) => (
          <div key={l} className="bg-muted text-[11px] font-medium uppercase text-muted-foreground px-2 py-1.5 text-center">
            {l}
          </div>
        ))}
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const items = byDay.get(key) ?? [];
          const inMonth = isSameMonth(d, cursor);
          const isToday = isSameDay(d, new Date());
          return (
            <div
              key={key}
              className={cn(
                "group bg-card min-h-[110px] p-1.5 relative",
                !inMonth && "bg-muted/30 text-muted-foreground",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums h-5 w-5 flex items-center justify-center rounded-full",
                    isToday && "bg-[#00D084] text-white",
                  )}
                >
                  {format(d, "d")}
                </span>
                <button
                  onClick={() => onCreateAt(key)}
                  className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded hover:bg-accent flex items-center justify-center"
                  title="Adicionar aqui"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <ul className="space-y-1">
                {items.slice(0, 3).map((t) => (
                  <li
                    key={t.id}
                    onClick={() => onSelectTask(t.id)}
                    className={cn(
                      "text-[11px] truncate rounded px-1.5 py-0.5 cursor-pointer hover:opacity-80",
                      isMeeting(t)
                        ? "bg-indigo-100 text-indigo-800"
                        : "bg-emerald-100 text-emerald-800",
                    )}
                    title={t.title}
                  >
                    {t.title}
                  </li>
                ))}
                {items.length > 3 && (
                  <li className="text-[10px] text-muted-foreground pl-1">+{items.length - 3} mais</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
