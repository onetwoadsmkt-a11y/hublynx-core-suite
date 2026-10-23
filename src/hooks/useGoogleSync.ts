import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncTasksNow, unsyncTaskFromCalendar } from "@/lib/google/calendar.functions";

/**
 * Envio imediato ao Google Agenda depois de criar/editar/remarcar/excluir uma tarefa.
 * Roda em segundo plano: a tela não espera o Google responder.
 */
export function useGoogleTaskSync() {
  const qc = useQueryClient();
  const syncFn = useServerFn(syncTasksNow);
  const unsyncFn = useServerFn(unsyncTaskFromCalendar);

  const syncNow = useCallback(
    (taskIds: string[]) => {
      const ids = taskIds.filter((id) => id && !id.startsWith("lead:"));
      if (ids.length === 0) return;
      syncFn({ data: { taskIds: ids } })
        .then(() => qc.invalidateQueries({ queryKey: ["agenda"] }))
        .catch(() => {});
    },
    [syncFn, qc],
  );

  /** Remove o evento do Google; chamar ANTES de excluir a tarefa. */
  const unsync = useCallback(
    (taskId: string) => unsyncFn({ data: { taskId } }).catch(() => null),
    [unsyncFn],
  );

  return { syncNow, unsync };
}

/** Campos que, se mudarem, precisam ir para o Google. */
export const GOOGLE_FIELDS = ["due_date", "title", "description", "status"] as const;
export function touchesGoogle(patch: Record<string, unknown> | null | undefined) {
  return !!patch && GOOGLE_FIELDS.some((f) => f in patch);
}
