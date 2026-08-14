import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Hublynx Core" }] }),
  component: ConfigLayout,
});

const TABS = [
  { to: "/configuracoes", label: "Geral" },
  { to: "/configuracoes/integracoes", label: "Integrações" },
  { to: "/configuracoes/integracoes/logs", label: "Logs" },
  { to: "/configuracoes/modulos", label: "Módulos" },
];

function ConfigLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="border-b bg-card px-6">
        <div className="mx-auto flex max-w-6xl gap-1">
          {TABS.map((t) => (
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
