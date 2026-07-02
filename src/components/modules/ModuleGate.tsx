import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { listUserModules, setModuleEnabled } from "@/lib/modules/modules.functions";
import { moduleForPath } from "@/lib/modules/registry";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function ModuleGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mod = moduleForPath(pathname);
  const list = useServerFn(listUserModules);
  const toggle = useServerFn(setModuleEnabled);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["user-modules"],
    queryFn: () => list(),
    staleTime: 60_000,
  });

  if (!mod) return <>{children}</>;
  const row = data?.find((r) => r.module_slug === mod.slug);
  // Default enabled unless explicitly disabled
  const enabled = row ? row.enabled : true;
  if (enabled) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md text-center rounded-xl border bg-card p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Módulo {mod.shortName} desativado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ative o módulo para acessar esta área. Você pode desativar novamente em Configurações → Módulos.
        </p>
        <Button
          className="mt-4"
          onClick={async () => {
            await toggle({ data: { slug: mod.slug, enabled: true } });
            await qc.invalidateQueries({ queryKey: ["user-modules"] });
            toast.success(`${mod.name} ativado.`);
          }}
        >
          Ativar módulo
        </Button>
      </div>
    </div>
  );
}
