import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeftRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  dismissDuplicate,
  getDuplicateCompare,
  mergeLeads,
} from "@/lib/pipeline/duplicates.functions";
import { cn } from "@/lib/utils";

type AnyLead = Record<string, any>;

/** O card tem alerta de duplicata pendente? */
export function duplicateInfo(lead: AnyLead) {
  const m = lead?.metadata;
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  if (typeof m.duplicate_of !== "string" || m.duplicate_dismissed) return null;
  return {
    of: m.duplicate_of as string,
    name: (m.duplicate_of_name as string | null) ?? null,
    by: (m.duplicate_by as string | null) ?? null,
  };
}

/** Selo no card: "Duplicado?" — abre a comparação. */
export function DuplicateBadge({ lead }: { lead: AnyLead }) {
  const [open, setOpen] = useState(false);
  const info = duplicateInfo(lead);
  if (!info) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/40"
        title={`Mesmo ${info.by ?? "contato"} de ${info.name ?? "outro lead"}`}
      >
        <AlertTriangle className="h-3 w-3" /> Duplicado?
      </button>
      {open && <DuplicateLeadDialog leadId={lead.id} open={open} onOpenChange={setOpen} />}
    </>
  );
}

const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const CLASS: Record<string, string> = {
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
  nutrition: "Nutrição",
  desqualificado: "Desqualificado",
};

function LeadColumn({
  title,
  lead,
  stage,
  highlight,
}: {
  title: string;
  lead: AnyLead;
  stage?: string | null;
  highlight?: boolean;
}) {
  const rows: [string, unknown][] = [
    ["Nome", lead.name],
    ["E-mail", lead.email],
    ["Telefone", lead.phone],
    ["Cidade", [lead.city, lead.state].filter(Boolean).join(" / ")],
    ["Origem", lead.source],
    [
      "Qualificação",
      lead.lead_classification
        ? (CLASS[lead.lead_classification] ?? lead.lead_classification)
        : null,
    ],
    ["Etapa", stage],
    ["Entrou em", fmtDate(lead.created_at)],
  ];
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border p-3",
        highlight && "border-amber-300 bg-amber-50/60 dark:bg-amber-500/5",
      )}
    >
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="break-words">
              {v ? String(v) : <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function DuplicateLeadDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getDuplicateCompare);
  const mergeFn = useServerFn(mergeLeads);
  const dismissFn = useServerFn(dismissDuplicate);
  const q = useQuery({
    queryKey: ["lead-duplicate", leadId],
    queryFn: () => getFn({ data: { leadId } }),
    enabled: open,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    qc.invalidateQueries({ queryKey: ["lead-detail"] });
    qc.invalidateQueries({ queryKey: ["lead-duplicate"] });
  };
  const merge = useMutation({
    mutationFn: (v: { keepId: string; dropId: string }) => mergeFn({ data: v }),
    onSuccess: () => {
      toast.success("Contatos unidos. O histórico dos dois ficou no mesmo card.");
      refresh();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dismiss = useMutation({
    mutationFn: () => dismissFn({ data: { leadId } }),
    onSuccess: () => {
      toast.success("Alerta removido. Os dois cards continuam separados.");
      refresh();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const busy = merge.isPending || dismiss.isPending;
  const d = q.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" /> Possível contato duplicado
          </DialogTitle>
          <DialogDescription>
            Este contato se inscreveu de novo. Compare e escolha: unir os dois cards (o histórico de
            ambos fica num só) ou manter separados.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">Carregando…</p>
        ) : q.isError ? (
          <p className="py-6 text-sm text-rose-600">{(q.error as Error).message}</p>
        ) : !d?.original ? (
          <p className="rounded-lg bg-muted p-3 text-sm">
            O card anterior não existe mais (foi excluído ou já unido). Você pode remover o alerta.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <LeadColumn title="Card anterior" lead={d.original} stage={d.stageName} />
            <LeadColumn title="Nova inscrição (este card)" lead={d.lead} highlight />
          </div>
        )}

        {d?.original && (
          <p className="text-xs text-muted-foreground">
            Ao unir: o card escolhido fica com a etapa e o responsável dele, recebe os dados que
            faltavam, a qualificação mais recente e todo o histórico (notas, tarefas, arquivos e
            respostas do formulário). O outro card é removido.
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" disabled={busy} onClick={() => dismiss.mutate()}>
            Não é a mesma pessoa
          </Button>
          {d?.original && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => merge.mutate({ keepId: d.lead.id, dropId: d.original!.id })}
              >
                <ArrowLeftRight className="h-4 w-4" /> Unir neste card
              </Button>
              <Button
                disabled={busy}
                onClick={() => merge.mutate({ keepId: d.original!.id, dropId: d.lead.id })}
              >
                {merge.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Unir no card anterior
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
