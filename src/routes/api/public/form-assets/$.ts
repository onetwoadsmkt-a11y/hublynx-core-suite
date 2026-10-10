import { createFileRoute } from "@tanstack/react-router";

/**
 * Imagens públicas dos formulários (logo, imagem principal).
 * Só entrega arquivos da pasta "forms" de cada empresa no bucket "org-files";
 * qualquer outro arquivo da empresa continua privado.
 */
const ALLOWED = /^[0-9a-f-]{36}\/forms\/[0-9a-f-]{36}\/[a-z0-9_-]+\.(png|jpe?g|webp|svg)$/i;

export const Route = createFileRoute("/api/public/form-assets/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = (params as Record<string, string>)["_splat"] ?? "";
        if (!ALLOWED.test(path)) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("org-files").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });

        const svg = path.toLowerCase().endsWith(".svg");
        return new Response(await data.arrayBuffer(), {
          headers: {
            "content-type": svg ? "image/svg+xml" : data.type || "application/octet-stream",
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
            // SVG servido isolado: sem scripts nem acesso à origem do app.
            ...(svg ? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
          },
        });
      },
    },
  },
});
