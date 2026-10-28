import { createFileRoute } from "@tanstack/react-router";

// Verificação periódica das automações por tempo e dos avisos de tarefas (ex.: a cada 15 min via pg_cron).
// Protegida pelo segredo AUTOMATIONS_CRON_SECRET no cabeçalho x-cron-secret.
export const Route = createFileRoute("/api/public/hooks/run-automations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.AUTOMATIONS_CRON_SECRET;
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const { runDueAutomations } = await import("@/lib/automations/engine.server");
        const result = await runDueAutomations({ limit: 300 });
        // avisos de tarefas designadas (e-mail na designação + resumo diário)
        let tasks: unknown = null;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runTaskNotifications } = await import("@/lib/tasks/task-notify.server");
          tasks = await runTaskNotifications(supabaseAdmin as any, { maxMails: 80 });
        } catch (e) {
          tasks = { error: String((e as Error)?.message ?? e) };
        }
        return Response.json({ ok: true, ...result, tasks });
      },
    },
  },
});
