import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_URL } from "@/integrations/supabase/env";

/**
 * Ícone do app do portal de um projeto (logo do cliente + nome do projeto).
 * Redireciona para a imagem gerada pela equipe; se ainda não existir, usa o
 * ícone padrão do portal.
 */
const REF = /^[a-z0-9-]{1,160}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function go(url: string, maxAge: number) {
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": `public, max-age=${maxAge}` },
  });
}

export const Route = createFileRoute("/api/public/portal/icon/$ref")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const s = new URL(request.url).searchParams.get("s") === "192" ? 192 : 512;
        const fallback = `/icons/portal-${s}.png`;
        const ref = String(params.ref ?? "").toLowerCase();
        if (!REF.test(ref) || ref === "inicio") return go(fallback, 3600);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await (supabaseAdmin as any)
          .from("projects")
          .select("id, organization_id")
          .eq(UUID.test(ref) ? "id" : "portal_slug", ref)
          .maybeSingle();
        if (!row?.organization_id) return go(fallback, 600);
        const url = `${SUPABASE_URL}/storage/v1/object/public/org-branding/${row.organization_id}/portal-icon-${row.id}-${s}.png`;
        const head = await fetch(url, { method: "HEAD" }).catch(() => null);
        return head?.ok ? go(url, 600) : go(fallback, 300);
      },
    },
  },
});
