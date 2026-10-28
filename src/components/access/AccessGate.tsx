import { type ReactNode } from "react";
import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useAccess } from "@/hooks/useAccess";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { isProjectOnlyAccess, orgModuleForPath, ORG_MODULE_LABELS, projectOnlyAllows } from "@/lib/org/modules-map";
import { Button } from "@/components/ui/button";

export function AccessGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const access = useAccess();
  const org = useOrgAccess();
  if (org.isLoading) return <div className="p-8 text-muted-foreground" role="status">Carregando acesso…</div>;
  if (org.isError) return <div className="p-8 space-y-3"><p>Não foi possível carregar seu acesso.</p><Button onClick={org.retryAccess}>Tentar novamente</Button></div>;
  if (org.isSuperAdmin) return <>{children}</>;
  // Cliente (franqueado) convidado para o portal: só enxerga o portal do cliente.
  if (org.organizations.length > 0 && org.organizations.every((o) => o.role === "guest")) {
    return <Navigate to="/portal" replace />;
  }
  if (!org.activeOrg) return <Denied title="Aguardando liberação de acesso" />;
  if (org.activeOrg.status === "expired") return <Denied title="Seu teste de 14 dias terminou" />;
  if (org.activeOrg.status !== "active" && org.activeOrg.status !== "trial") return <Denied title="Acesso da empresa suspenso" />;
  // Equipe de projeto: só o módulo Projetos (e as tarefas designadas a ela).
  if (isProjectOnlyAccess(org) && !projectOnlyAllows(pathname)) {
    return <Navigate to="/projetos" replace />;
  }
  if (pathname.startsWith("/admin")) {
    const { isAdmin } = access;
    if (!isAdmin) return <Denied title="Área restrita à administração da plataforma" />;
  }
  const orgModule = orgModuleForPath(pathname);
  if (orgModule && !org.hasModule(orgModule)) return <Denied title={`${ORG_MODULE_LABELS[orgModule]} não está liberado para sua conta`} />;
  return <>{children}</>;
}

function Denied({ title }: { title: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Fale com o administrador da Hublynx para liberar o acesso a esta área.
        </p>
        <Button asChild className="mt-4">
          <Link to="/dashboard">Voltar ao Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
