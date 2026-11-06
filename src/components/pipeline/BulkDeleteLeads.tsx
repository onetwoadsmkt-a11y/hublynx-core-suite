import { createContext, useContext, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteLeads } from "@/lib/pipeline/lead-delete.functions";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { invalidatePendingQueries } from "@/hooks/usePendingItems";

/** Seleção de leads no Kanban (modo "Selecionar"). */
export type LeadSelection = { active: boolean; selected: Set<string>; toggle: (id: string) => void };
export const LeadSelectionContext = createContext<LeadSelection | null>(null);
export const useLeadSelection = () => useContext(LeadSelectionContext);

/** Só administradores da empresa (ou da plataforma) veem a exclusão em massa. */
export function useCanBulkDelete() {
  const org = useOrgAccess();
  const { isAdmin } = useIsAdmin();
  return isAdmin || org.isOrgAdmin;
}

const CONFIRM_WORD = "EXCLUIR";

/**
 * Botão "Excluir" da seleção de leads, com confirmação. Acima de 10 leads pede para digitar
 * EXCLUIR. Leads ligados a projeto não são apagados (o servidor avisa quais ficaram).
 */
export function BulkDeleteLeadsButton({
  ids, names, onDone, className,
}: { ids: string[]; names: (id: string) => string | undefined; onDone: () => void; className?: string }) {
  const can = useCanBulkDelete();
  const qc = useQueryClient();
  const fn = useServerFn(deleteLeads);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  if (!can || !ids.length) return null;
  const many = ids.length > 10;
  const sample = ids.slice(0, 6).map((id) => names(id) ?? "Lead");

  const run = async () => {
    setBusy(true);
    let deleted = 0;
    const kept: string[] = [];
    try {
      for (let i = 0; i < ids.length; i += 500) {
        const r = await fn({ data: { ids: ids.slice(i, i + 500) } });
        deleted += r.deleted;
        kept.push(...r.kept);
      }
      if (deleted) toast.success(deleted === 1 ? "1 lead excluído." : `${deleted} leads excluídos.`);
      if (kept.length) {
        toast.warning(`${kept.length} lead(s) ficaram por estar ligados a projeto: ${kept.slice(0, 3).join(", ")}${kept.length > 3 ? "…" : ""}`);
      }
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      if (deleted) onDone();
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      invalidatePendingQueries(qc);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        className={className ?? "h-8"}
        onClick={() => { setTyped(""); setOpen(true); }}
      >
        <Trash2 className="mr-1 h-4 w-4" /> Excluir {ids.length > 1 ? `${ids.length} leads` : "lead"}
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {ids.length === 1 ? "este lead" : `${ids.length} leads`}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {sample.join(", ")}
                  {ids.length > sample.length ? ` e mais ${ids.length - sample.length}` : ""}.
                </p>
                <p>
                  Saem também as anotações, tarefas do lead, jornada, arquivos e os eventos no Google Agenda
                  (sem e-mail de cancelamento para o lead). <strong>Não dá para desfazer.</strong>
                </p>
                <p className="text-xs text-muted-foreground">Leads ligados a um projeto não são excluídos.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {many && (
            <div className="space-y-1.5">
              <label htmlFor="bulk-del-confirm" className="text-sm">
                Para confirmar, digite <strong>{CONFIRM_WORD}</strong>
              </label>
              <Input id="bulk-del-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy || (many && typed.trim().toUpperCase() !== CONFIRM_WORD)}
              onClick={run}
            >
              {busy ? "Excluindo…" : `Excluir ${ids.length === 1 ? "lead" : `${ids.length} leads`}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
