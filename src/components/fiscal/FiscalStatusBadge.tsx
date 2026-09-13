import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FISCAL_STATUS_LABEL, type FiscalDocumentStatus } from "@/lib/fiscal/types";

const TONE: Record<FiscalDocumentStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  pendente: "bg-amber-100 text-amber-800",
  processando: "bg-sky-100 text-sky-800",
  autorizada: "bg-emerald-100 text-emerald-800",
  rejeitada: "bg-red-100 text-red-800",
  cancelada: "bg-zinc-200 text-zinc-700",
  erro: "bg-red-100 text-red-800",
};

export function FiscalStatusBadge({
  status,
  className,
}: {
  status: FiscalDocumentStatus;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn("border-0 font-medium", TONE[status], className)}>
      {FISCAL_STATUS_LABEL[status]}
    </Badge>
  );
}
