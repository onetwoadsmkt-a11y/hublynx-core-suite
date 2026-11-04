import { createFileRoute } from "@tanstack/react-router";

// Lembretes no celular (tarefa em breve / atrasada). Também rodam junto com
// /api/public/hooks/run-automations (a cada 15 min). Protegida pelo mesmo segredo
// AUTOMATIONS_CRON_SECRET no cabeçalho x-cron-secret (antes era aberta).
export const Route = createFileRoute("/api/public/hooks/run-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.AUTOMATIONS_CRON_SECRET;
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runTaskReminders } = await import("@/lib/tasks/reminders.server");
        return Response.json(await runTaskReminders(supabaseAdmin as any));
      },
      GET: async () =>
        new Response("Use POST", { status: 405, headers: { allow: "POST" } }),
    },
  },
});
