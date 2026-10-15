import { createFileRoute } from "@tanstack/react-router";

/**
 * Manifesto do app do Portal do cliente, um por projeto: instala com o nome do
 * projeto, as cores da empresa e abre direto no portal (separado do Core).
 * Só usa dados já públicos na tela de entrada do portal (nome do projeto e empresa).
 */
const REF = /^[a-z0-9-]{1,160}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
  });
}

export const Route = createFileRoute("/api/public/portal/manifest/$ref")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const ref = String(params.ref ?? "").toLowerCase();
        const icons = [
          {
            src: "/icons/portal-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icons/portal-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ];
        const base = {
          description:
            "Acompanhe o andamento do seu projeto, conclua suas tarefas e envie documentos.",
          scope: "/portal",
          display: "standalone",
          orientation: "portrait",
          lang: "pt-BR",
          icons,
        };
        if (!REF.test(ref) || ref === "inicio") {
          return json({
            ...base,
            id: "/portal/",
            name: "Portal do cliente",
            short_name: "Portal",
            start_url: "/portal",
            background_color: "#f6f7f9",
            theme_color: "#0a2557",
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await (supabaseAdmin as any)
          .from("projects")
          .select("name, portal_slug, organizations(name, brand_color)")
          .eq(UUID.test(ref) ? "id" : "portal_slug", ref)
          .maybeSingle();
        const org = (
          Array.isArray(row?.organizations) ? row?.organizations[0] : row?.organizations
        ) as { name?: string; brand_color?: string | null } | null;
        const name = (row?.name as string | undefined)?.trim() || "Portal do cliente";
        const orgName = org?.name?.trim() || "";
        const color = org?.brand_color && HEX.test(org.brand_color) ? org.brand_color : "#0a2557";
        const slug = (row?.portal_slug as string | undefined) || ref;
        return json({
          ...base,
          // id próprio: cada projeto instala como um app separado
          id: `/portal/${slug}`,
          name:
            orgName && !name.toLowerCase().includes(orgName.toLowerCase())
              ? `${name} · ${orgName}`
              : name,
          short_name: (name.length <= 14 ? name : orgName || name).slice(0, 24),
          start_url: `/portal/${slug}`,
          background_color: "#f6f7f9",
          theme_color: color,
        });
      },
    },
  },
});
