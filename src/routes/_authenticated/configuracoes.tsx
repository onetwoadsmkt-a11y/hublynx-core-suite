import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useAccess } from "@/hooks/useAccess";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Hublynx Core" }] }),
  component: ConfigLayout,
});

const TABS = [
  { to: "/configuracoes", label: "Geral", adminOnly: false },
  { to: "/configuracoes/integracoes", label: "Integrações", adminOnly: false },
  { to: "/configuracoes/modulos", label: "Módulos", adminOnly: true },
];

function ConfigLayout() {
  const { isAdmin } = useAccess();
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);
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
