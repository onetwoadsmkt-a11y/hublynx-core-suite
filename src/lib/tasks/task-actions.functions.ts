import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GOOGLE_API_BASE, googleHeaders } from "@/lib/google/google.functions";

/**
 * Excluir tarefa (Tarefas, Agenda e janela da tarefa):
 * - tarefa de etapa de projeto → "cancelado" (mantém o histórico, como nas Etapas);
 * - demais → apaga de vez.
 * Só tira o evento do Google (da agenda do dono) depois que o Core confirmou a exclusão.
 */
export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: task, error } = await db
      .from("tasks")
      .select("id, owner_id, project_id, stage_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task) throw new Error("Tarefa não encontrada ou sem permissão.");

    const { data: mirrors } = await db
      .from("task_communications")
      .select("id, provider_id")
      .eq("task_id", data.taskId)
      .eq("kind", "meeting");

    let soft = false;
    if (task.stage_id && task.project_id) {
      const { data: canEdit } = await db.rpc("can_edit_project", { _project: task.project_id });
      if (canEdit !== true) throw new Error("Só quem edita o projeto pode excluir tarefas.");
      const { data: row, error: uErr } = await db
        .from("tasks")
        .update({ status: "cancelado" })
        .eq("id", data.taskId)
        .select("id")
        .maybeSingle();
      if (uErr) throw new Error(uErr.message);
      if (!row) throw new Error("Sem permissão para excluir esta tarefa.");
      soft = true;
    } else {
      const { data: gone, error: dErr } = await db.from("tasks").delete().eq("id", data.taskId).select("id");
      if (dErr) throw new Error(dErr.message);
      if (!gone?.length) throw new Error("Sem permissão para excluir esta tarefa.");
    }

    // Google: melhor esforço, na agenda do dono da tarefa
    const events = ((mirrors ?? []) as any[]).filter((m) => m.provider_id);
    if (events.length) {
      try {
        const headers = await googleHeaders(task.owner_id ?? context.userId);
        for (const m of events) {
          await fetch(`${GOOGLE_API_BASE}/calendar/v3/calendars/primary/events/${m.provider_id}`, { method: "DELETE", headers });
        }
        if (soft) await db.from("task_communications").delete().in("id", events.map((m) => m.id));
      } catch {
        /* sem Google conectado */
      }
    }
    return { ok: true as const, soft };
  });
