import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ModuleManifest } from "@/components/modules/ModuleManifest";
import { ModuleGate } from "@/components/modules/ModuleGate";
import { AccessGate } from "@/components/access/AccessGate";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { BrandTheme } from "@/components/BrandTheme";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Rotas do PWA mobile (/app/*) rodam fora do AppShell desktop.
  if (pathname.startsWith("/app")) {
    return (
      <WorkspaceProvider key={user.id} userId={user.id}>
        <BrandTheme />
        <ModuleManifest />
        <AccessGate><Outlet /></AccessGate>
      </WorkspaceProvider>
    );
  }
  return (
    <WorkspaceProvider key={user.id} userId={user.id}>
      <BrandTheme />
      <AppShell>
        <ModuleManifest />
        <AccessGate>
          <ModuleGate>
            <Outlet />
          </ModuleGate>
        </AccessGate>
      </AppShell>
    </WorkspaceProvider>
  );
}
