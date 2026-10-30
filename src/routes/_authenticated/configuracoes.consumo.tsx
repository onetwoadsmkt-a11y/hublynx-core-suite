import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getMyOrgUsage } from "@/lib/platform/platform.functions";
import { fmtPrice, orgLimits } from "@/lib/platform/storage-plans";
import { OrgUsageSummary, PackagesTable } from "@/components/platform/StorageUsage";

export const Route = createFileRoute("/_authenticated/configuracoes/consumo")({
  head: () => ({ meta: [{ title: "Consumo — Hublynx Core" }] }),
  component: ConsumptionPage,
});

function ConsumptionPage() {
  const qc = useQueryClient();
  const { activeOrganization, role } = useWorkspace();
  const orgId = activeOrganization?.id ?? null;
  const canSee = role === "org_admin" || role === "super_admin";
  const fn = useServerFn(getMyOrgUsage);
  const q = useQuery({
    queryKey: ["my-org-usage", orgId],
    enabled: !!orgId && canSee,
    queryFn: () => fn({ data: { organizationId: orgId!, refresh: false } }),
    staleTime: 60_000,
  });
  const refresh = useMutation({
    mutationFn: () => fn({ data: { organizationId: orgId!, refresh: true } }),
    onSuccess: (d) => {
      qc.setQueryData(["my-org-usage", orgId], d);
      toast.success("Consumo medido de novo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canSee) {
    return <p className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">Só o administrador da empresa vê o consumo.</p>;
  }
  const d = q.data;
  const lim = d ? orgLimits(d.packages, d.storage_package) : null;
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Database className="h-5 w-5" /> Consumo
          </h1>
          <p className="text-sm text-muted-foreground">
            Espaço de banco de dados e de arquivos que {activeOrganization?.name ?? "a empresa"} usa no Core.
          </p>
        </div>
        <Button variant="outline" disabled={refresh.isPending || !orgId} onClick={() => refresh.mutate()}>
          <RefreshCw className={`h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} /> Medir agora
        </Button>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Medindo…</p>
      ) : q.isError ? (
        <p className="text-sm text-rose-600">Não foi possível carregar o consumo. {(q.error as Error).message}</p>
      ) : d && lim ? (
        <>
          <Card className="space-y-4 rounded-2xl p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base font-bold">
                {lim.base.name}
                {lim.extra ? ` + ${lim.extra.name}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Mensalidade: {fmtPrice(lim.monthly_price)}
                {d.measured_at
                  ? ` · medido em ${new Date(d.measured_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                  : ""}
              </p>
            </div>
            <OrgUsageSummary
              packages={d.packages}
              extraCode={d.storage_package}
              database_mb={d.database_mb}
              storage_mb={d.storage_mb}
            />
            <p className="text-xs text-muted-foreground">
              Banco de dados: leads, tarefas, projetos, histórico e mensagens. Arquivos: anexos das tarefas, das planilhas e dos leads.
              Ao chegar perto do limite você recebe a indicação do pacote; nada para de funcionar.
            </p>
          </Card>
          <Card className="space-y-3 rounded-2xl p-5">
            <div>
              <h2 className="font-semibold">Plano e pacotes de espaço</h2>
              <p className="text-xs text-muted-foreground">Para contratar mais espaço, fale com o suporte do Core.</p>
            </div>
            <PackagesTable packages={d.packages} current={d.storage_package} />
          </Card>
        </>
      ) : null}
    </div>
  );
}
