import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NFSE_STATE_LABEL, type FinanceNfseState } from "@/lib/fiscal/types";

const TONE: Record<FinanceNfseState, string> = {
  emitida: "bg-emerald-100 text-emerald-800",
  pendente: "bg-amber-100 text-amber-800",
  nao_emitir: "bg-muted text-muted-foreground",
};

/** Indicação de NFS-e em Contas a Receber (derivada de fiscal_document_finances). */
export function NfseStateBadge({ state }: { state: FinanceNfseState }) {
  return (
    <Badge variant="secondary" className={cn("border-0 text-[11px] font-medium", TONE[state])}>
      {NFSE_STATE_LABEL[state]}
    </Badge>
  );
}
