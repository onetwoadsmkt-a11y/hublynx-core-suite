import { format, parseISO } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, ListTodo, ChevronRight } from "lucide-react";
import { PRIORITY_LABEL, PRIORITY_TONE, type Priority } from "@/components/tasks/TaskDrawer";
import type { KanbanColumn } from "@/hooks/useKanbanColumns";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: Priority;
  due_date: string | null;
  briefing?: any;
};

interface Props {
  tasks: Task[];
  kanbanCols: KanbanColumn[];
  onSelect: (id: string) => void;
}

export function TaskListMobile({ tasks, kanbanCols, onSelect }: Props) {
  if (tasks.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground rounded-2xl">
        Nenhuma tarefa.
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {tasks.map((t) => {
        const col = kanbanCols.find((c) => c.key === t.status);
        const meeting = (t.briefing as any)?.type === "reuniao";
        const deadline = (t.briefing as any)?.deadline as string | null | undefined;
        return (
          <Card
            key={t.id}
            onClick={() => onSelect(t.id)}
            className="p-3 rounded-2xl cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-start gap-2">
              {meeting ? (
                <CalendarCheck className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
              ) : (
                <ListTodo className="h-4 w-4 text-[var(--brand-dark)] dark:text-primary mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{t.title}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {col && (
                    <Badge variant="secondary" className={cn("text-[10px]", col.tone)}>
                      {col.label}
                    </Badge>
                  )}
                  <Badge variant="outline" className={cn("text-[10px]", PRIORITY_TONE[t.priority])}>
                    {PRIORITY_LABEL[t.priority]}
                  </Badge>
                  {t.due_date && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {format(parseISO(t.due_date), "dd/MM HH:mm")}
                    </span>
                  )}
                  {deadline && (
                    <span className="text-[11px] text-amber-700">
                      Prazo: {format(parseISO(deadline), "dd/MM")}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
