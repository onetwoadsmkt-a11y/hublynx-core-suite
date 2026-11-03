import { createFileRoute } from "@tanstack/react-router";

/**
 * Confere se form.hublynx.com.br já está ligado a este app (Core). O Core só passa a
 * copiar os links dos formulários com esse domínio quando esta resposta chega de lá.
 */
export const Route = createFileRoute("/api/public/forms-host")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ app: "core-suite" }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=300",
          },
        }),
    },
  },
});
