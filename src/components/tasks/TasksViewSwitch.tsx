import { Link } from "@tanstack/react-router";
import { Calendar as CalendarIcon, LayoutGrid, List as ListIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TasksView = "lista" | "kanban" | "calendario";

/**
 * Alternância única do módulo Tarefas, como no Kommo: Lista e Kanban ficam em
 * /tarefas e o Calendário (único, com Google Agenda) fica em /agenda.
 */
export function TasksViewSwitch({ current, className }: { current: TasksView; className?: string }) {
  const item = (view: TasksView, label: string, Icon: typeof ListIcon) => {
    const active = current === view;
    const cls = cn(
      "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
      active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    );
    const content = (<><Icon className="h-4 w-4" /><span className="hidden sm:inline">{label}</span></>);
    if (view === "calendario") {
      return <Link to="/agenda" search={{ view: "month" } as any} className={cls} aria-current={active ? "page" : undefined} title={label}>{content}</Link>;
    }
    return <Link to="/tarefas" search={{ view } as any} className={cls} aria-current={active ? "page" : undefined} title={label}>{content}</Link>;
  };
  return (
    <nav aria-label="Visualização de tarefas" className={cn("inline-flex items-center gap-1 rounded-lg bg-muted p-1", className)}>
      {item("lista", "Lista", ListIcon)}
      {item("kanban", "Kanban", LayoutGrid)}
      {item("calendario", "Calendário", CalendarIcon)}
    </nav>
  );
}
