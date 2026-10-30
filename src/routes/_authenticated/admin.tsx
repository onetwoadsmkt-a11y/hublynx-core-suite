import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Central Administrativa — Hublynx" },
      {
        name: "description",
        content: "Empresas, módulos, usuários, preços, faixas de recursos e simulador comercial.",
      },
      { property: "og:title", content: "Central Administrativa — Hublynx" },
      {
        property: "og:description",
        content: "Gestão da plataforma: empresas, módulos, preços e assinaturas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const [{ data: role }, { data: platform }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
      supabase.from("platform_admins" as any).select("user_id").eq("user_id", u.user.id).maybeSingle(),
    ]);
    if (!role && !platform) throw redirect({ to: "/dashboard" });
  },
  component: AdminLayout,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error instanceof Error ? error.message : String(error)}</div>,
  notFoundComponent: () => <div className="p-6">Não encontrado.</div>,
});

const TABS = [
  { to: "/admin", label: "Visão geral", exact: true },
  { to: "/admin/empresas", label: "Empresas" },
  { to: "/admin/usuarios", label: "Usuários" },
  { to: "/admin/precos", label: "Preços e faixas" },
  { to: "/admin/simulador", label: "Simulador" },
  { to: "/admin/assinaturas", label: "Assinaturas" },
  { to: "/admin/armazenamento", label: "Consumo e planos" },
];

function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="border-b bg-card px-4 md:px-6">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              activeOptions={{ exact: !!t.exact }}
              className="whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground [&.active]:border-primary [&.active]:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
        <Outlet />
      </div>
    </div>
  );
}
