import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useAccess } from "@/hooks/useAccess";
import { useWorkspace } from "@/hooks/useWorkspace";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Hublynx Core" }] }),
  component: ConfigLayout,
});

const TABS = [
  { to: "/configuracoes", label: "Geral", adminOnly: false },
  { to: "/configuracoes/integracoes", label: "Integrações", adminOnly: false },
  { to: "/configuracoes/modelos", label: "Modelos de projeto", adminOnly: false },
  { to: "/configuracoes/modulos", label: "Módulos", adminOnly: true },
  { to: "/configuracoes/aparencia", label: "Aparência", adminOnly: false, orgAdminOnly: true },
  { to: "/configuracoes/consumo", label: "Consumo", adminOnly: false, orgAdminOnly: true },
];

function ConfigLayout() {
  const { isAdmin } = useAccess();
  const { role } = useWorkspace();
  const isOrgAdmin = role === "org_admin" || role === "super_admin";
  const tabs = TABS.filter(
    (t) => (!t.adminOnly || isAdmin) && (!("orgAdminOnly" in t && t.orgAdminOnly) || isOrgAdmin || isAdmin),
  );
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="border-b bg-card px-6">
        <div className="mx-auto flex max-w-6xl gap-1">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              activeOptions={{ exact: true }}
              className="border-b-2 border-transparent px-4 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground [&.active]:border-primary [&.active]:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
