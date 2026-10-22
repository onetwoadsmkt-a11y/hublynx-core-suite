import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarCheck, CheckCircle2, ListTodo, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, PRIORITY_TONE, type Priority } from "@/components/tasks/TaskDrawer";
import { LeadLink } from "@/components/pipeline/LeadCardHost";
import { isDoneStatus, isOverdue, type PendingPriority } from "@/lib/tasks/pending";
import type { LeadScheduledTask } from "@/lib/pipeline/task-display";

export type DayItem = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  priority: PendingPriority;
  briefing?: any;
  leadTask?: LeadScheduledTask;
};

export type DayExtra = { id: string; title: string; time: string | null; label: string; href?: string | null };

const PRIORITY_ORDER: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };

function timeOf(due: string | null) {
  if (!due) return null;
  const d = parseISO(due);
  if (!isValid(d)) return null;
  if (/T00:00(:00(\.0+)?)?(Z|\+00:?00)?$/.test(due) || /^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  return format(d, "HH:mm");
}

/**
 * Painel com as pendências de um dia. É o mesmo em Tarefas e no Calendário:
 * gaveta de baixo para cima no celular, lateral no computador.
 */
export function DayPendingSheet({
  date, items, extras = [], onOpenChange, onSelect, onAdd,
}: {
  date: Date | null;
  items: DayItem[];
  extras?: DayExtra[];
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onAdd?: (dateKey: string) => void;
}) {
  const isMobile = useIsMobile();
  const open = !!date;
  const pending = items
    .filter((i) => !isDoneStatus(i.status))
    .sort((a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
      (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const done = items.filter((i) => isDoneStatus(i.status));
  const overdueCount = pending.filter((i) => isOverdue(i)).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("flex flex-col gap-0 p-0", isMobile ? "max-h-[85dvh] rounded-t-3xl" : "w-full sm:max-w-md")}
      >
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle className="capitalize">
            {date ? format(date, "EEEE, dd 'de' MMMM", { locale: ptBR }) : ""}
          </SheetTitle>
          <SheetDescription>
            {pending.length === 0
              ? "Nenhuma pendência neste dia."
              : `${pending.length} pendente${pending.length === 1 ? "" : "s"}${overdueCount ? ` · ${overdueCount} atrasada${overdueCount === 1 ? "" : "s"}` : ""}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {pending.map((i) => {
            const overdue = isOverdue(i);
            const meeting = i.briefing?.type === "reuniao";
            const time = timeOf(i.due_date);
            return (
              <div
                key={i.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(i.id)}
                onKeyDown={(e) => { if (e.key === "Enter") onSelect(i.id); }}
                className={cn(
                  "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border p-3 transition hover:shadow-sm",
                  overdue ? "border-destructive/40 bg-destructive/10" : "bg-card",
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {overdue ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  ) : meeting ? (
                    <CalendarCheck className="h-4 w-4 text-indigo-500" />
                  ) : (
                    <ListTodo className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-semibold", overdue && "text-destructive")}>{i.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {time && <span className="tabular-nums">{time}</span>}
                    {overdue && <span className="font-medium text-destructive">Atrasada</span>}
                    {i.leadTask && <LeadLink leadId={i.leadTask.lead_id} name={i.leadTask.leads.name} />}
                  </div>
                </div>
                <Badge variant="outline" className={cn("shrink-0 text-[10px]", PRIORITY_TONE[i.priority as Priority])}>
                  {PRIORITY_LABEL[i.priority as Priority]}
                </Badge>
              </div>
            );
          })}

          {extras.length > 0 && (
            <div className="pt-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Outros compromissos</p>
              <div className="space-y-2">
                {extras.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
                    <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{e.time ?? "—"}</span>
                    <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    {e.href ? (
                      <a href={e.href} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-primary underline">{e.label}</a>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">{e.label}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {done.length > 0 && (
            <details className="pt-2">
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Concluídas ({done.length})
              </summary>
              <div className="mt-2 space-y-2">
                {done.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => onSelect(i.id)}
                    className="flex w-full items-center gap-2 rounded-xl border bg-muted/30 p-3 text-left text-sm text-muted-foreground line-through"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span className="truncate">{i.title}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>

        {onAdd && date && (
          <div className="border-t p-4">
            <Button className="w-full" onClick={() => onAdd(format(date, "yyyy-MM-dd"))}>
              <Plus className="mr-1.5 h-4 w-4" /> Adicionar tarefa neste dia
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
