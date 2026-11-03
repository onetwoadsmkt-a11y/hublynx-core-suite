import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { overdueLabel } from "@/lib/tasks/pending";

/**
 * Padrão único de destaque das tarefas atrasadas (mesmo do Roadmap):
 * contorno vermelho no cartão + faixa rosa no topo "Atrasada há N dias" + prazo em vermelho.
 * Vale para equipe, gestores e portal do cliente.
 */
export const OVERDUE_RING = "ring-2 ring-rose-500 shadow-[0_12px_32px_rgba(180,35,24,.14)]";
export const OVERDUE_BAND = "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-200";
export const OVERDUE_TEXT = "font-semibold text-rose-600 dark:text-rose-300";

export function OverdueBand({
  task,
  prefix,
  className,
}: {
  task: { due_date: string | null; status?: string | null };
  prefix?: string;
  className?: string;
}) {
  const label = overdueLabel(task);
  if (!label) return null;
  return (
    <div className={cn("flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-extrabold", OVERDUE_BAND, className)}>
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{prefix ? `${prefix} · ` : ""}{label}</span>
    </div>
  );
}
