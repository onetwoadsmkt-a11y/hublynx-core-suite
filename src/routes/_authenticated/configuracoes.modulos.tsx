import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUserModules, setModuleEnabled } from "@/lib/modules/modules.functions";
import { MODULES } from "@/lib/modules/registry";
import { InstallModuleButton } from "@/components/modules/InstallModuleButton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { orgModuleForPath } from "@/lib/org/modules-map";

export const Route = createFileRoute("/_authenticated/configuracoes/modulos")({
  head: () => ({ meta: [{ title: "Módulos da conta — Core Suite" }, { name: "description", content: "Gerencie os módulos disponíveis para sua conta Core Suite." }, { property: "og:title", content: "Módulos da conta — Core Suite" }, { property: "og:description", content: "Módulos autorizados da empresa ativa." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ModulesPage,
});

function ModulesPage() {
  const org = useOrgAccess();
  const list = useServerFn(listUserModules);
  const toggle = useServerFn(setModuleEnabled);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["user-modules"],
    queryFn: () => list(),
    staleTime: 60_000,
  });

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Módulos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada módulo pode ser instalado como um app independente (PWA). Você pode usar só o que precisa
          — ou instalar o Hub Central para acessar tudo integrado num único ícone.
        </p>
      </div>

      <div className="space-y-3">
        {MODULES.filter((m) => { const code = orgModuleForPath(m.route); return !code || org.hasModule(code); }).map((m) => {
          const row = data?.find((r) => r.module_slug === m.slug);
          const enabled = row ? row.enabled : true;
          const Icon = m.icon;
          return (
            <div
              key={m.slug}
              className="flex items-center gap-4 rounded-xl border bg-card p-4"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl text-white shrink-0"
                style={{ backgroundColor: m.themeColor }}
              >
                <Icon className="h-6 w-6" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate">{m.name}</h3>
                  <Link
                    to={m.route}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    Abrir <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <p className="text-sm text-muted-foreground truncate">{m.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Rota: {m.scope}</p>
              </div>

              <div className="flex items-center gap-3">
                {m.slug !== "hub" && <InstallModuleButton module={m} installed={!!row?.installed_at} />}
                <div className="flex flex-col items-center">
                  <Switch
                    checked={enabled}
                    onCheckedChange={async (v) => {
                      await toggle({ data: { slug: m.slug, enabled: v, organizationId: org.activeOrg?.id } });
                      await qc.invalidateQueries({ queryKey: ["user-modules"] });
                      toast.success(v ? `${m.shortName} ativado` : `${m.shortName} desativado`);
                    }}
                  />
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    {enabled ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">Como instalar:</strong> clique em "Instalar como app" ou, no
          celular, abra a rota do módulo e use a opção "Adicionar à tela inicial" do navegador. Cada módulo
          vira um ícone separado — os dados permanecem sincronizados no sistema completo.
        </p>
      </div>
    </div>
  );
}
