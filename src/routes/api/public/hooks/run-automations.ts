import { createFileRoute } from "@tanstack/react-router";

// Verificação periódica das automações por tempo (ex.: a cada 15 min via pg_cron).
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
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
