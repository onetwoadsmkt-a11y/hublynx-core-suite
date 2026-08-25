import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useAccess } from "@/hooks/useAccess";
import { capabilityForPath, CAPABILITY_LABELS } from "@/lib/subscriptions/capabilities";
import { Button } from "@/components/ui/button";

export function AccessGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isLoading, isAdmin, can, status } = useAccess();

  if (isLoading || isAdmin) return <>{children}</>;

  if (pathname.startsWith("/admin")) return <Denied title="Área restrita a administradores" />;

  const cap = capabilityForPath(pathname);
  if (!cap || can(cap)) return <>{children}</>;

  return (
    <Denied
      title={
        status === "suspenso" || status === "cancelado"
          ? "Assinatura inativa"
          : `${CAPABILITY_LABELS[cap]} não está incluído no seu plano`
      }
    />
  );
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
          <Link to="/hub">Voltar ao Hub Central</Link>
        </Button>
      </div>
    </div>
  );
}
