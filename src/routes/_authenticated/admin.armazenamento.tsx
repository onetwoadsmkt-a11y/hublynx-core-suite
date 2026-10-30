import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listStoragePackages, listUsage, recalcUsage, setOrgStoragePackage } from "@/lib/platform/platform.functions";
import { DEFAULT_PACKAGES, fmtMB, fmtPrice, orgLimits, usageLevel } from "@/lib/platform/storage-plans";
import { OrgUsageSummary, PackagesTable } from "@/components/platform/StorageUsage";

export const Route = createFileRoute("/_authenticated/admin/armazenamento")({
  head: () => ({
    meta: [
      { title: "Consumo e planos — Hublynx" },
      { name: "description", content: "Acompanhe arquivos, banco e usuários de cada empresa frente aos limites da faixa." },
      { property: "og:title", content: "Armazenamento por empresa — Hublynx" },
      { property: "og:description", content: "Uso de arquivos e banco por empresa, comparado aos limites contratados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoragePage,
});

function StoragePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsage);
  const recalcFn = useServerFn(recalcUsage);
  const pkgFn = useServerFn(listStoragePackages);
  const setPkgFn = useServerFn(setOrgStoragePackage);

  const q = useQuery({ queryKey: ["platform-usage"], queryFn: () => listFn(), staleTime: 60_000 });
  const pkgQ = useQuery({ queryKey: ["storage-packages"], queryFn: () => pkgFn(), staleTime: 300_000 });
  const packages = pkgQ.data?.packages ?? DEFAULT_PACKAGES;

  const recalcM = useMutation({
    mutationFn: () => recalcFn({}),
    onSuccess: () => {
      toast.success("Consumo medido de novo");
      qc.invalidateQueries({ queryKey: ["platform-usage"] });
      qc.invalidateQueries({ queryKey: ["platform-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pkgM = useMutation({
    mutationFn: (v: { organizationId: string; code: string | null }) => setPkgFn({ data: v }),
    onSuccess: () => {
      toast.success("Pacote atualizado");
      qc.invalidateQueries({ queryKey: ["platform-usage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];
  const over = rows.filter((u) => {
    const lim = orgLimits(packages, u.storage_package);
    return usageLevel(u.database_mb, lim.database_mb) !== "ok" || usageLevel(u.storage_mb, lim.storage_mb) !== "ok";
  }).length;
  const totalDb = rows.reduce((a, u) => a + u.database_mb, 0);
  const totalFiles = rows.reduce((a, u) => a + u.storage_mb, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Consumo e planos</h1>
          <p className="text-sm text-muted-foreground">
            Banco de dados e arquivos de cada empresa frente ao Plano Core e ao pacote extra contratado.
          </p>
        </div>
        <Button variant="outline" onClick={() => recalcM.mutate()} disabled={recalcM.isPending}>
          <RefreshCw className={`h-4 w-4 ${recalcM.isPending ? "animate-spin" : ""}`} /> Medir agora
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Banco de dados (todas as empresas)</p>
          <p className="text-2xl font-extrabold tabular-nums">{fmtMB(totalDb)}</p>
          <p className="text-xs text-muted-foreground">de 8 GB incluídos no Supabase Pro</p>
        </Card>
        <Card className="rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Arquivos (todas as empresas)</p>
          <p className="text-2xl font-extrabold tabular-nums">{fmtMB(totalFiles)}</p>
          <p className="text-xs text-muted-foreground">de 100 GB incluídos no Supabase Pro</p>
        </Card>
        <Card className="rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Empresas perto ou acima do limite</p>
          <p className={`text-2xl font-extrabold tabular-nums ${over ? "text-amber-700" : ""}`}>{over}</p>
          <p className="text-xs text-muted-foreground">de {rows.length} empresa(s)</p>
        </Card>
      </div>

      <Card className="space-y-3 rounded-2xl p-4">
        <div>
          <h2 className="font-semibold">Plano e escala de pacotes</h2>
          <p className="text-xs text-muted-foreground">
            O Plano Core inclui o espaço abaixo; ao passar do limite a empresa contrata um pacote extra. Valores ocultos por enquanto.
            {!pkgQ.data?.stored && " (padrão do sistema — rode a migração 28 para guardar no banco)"}
          </p>
        </div>
        <PackagesTable packages={packages} />
      </Card>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {rows.map((u) => {
            const lim = orgLimits(packages, u.storage_package);
            return (
              <Card key={u.organization_id} className="space-y-3 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{u.organization}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.users_count} usuário(s) ativo(s)
                      {u.measured_at ? ` · medido em ${new Date(u.measured_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : " · nunca medido"}
                      {` · mensalidade: ${fmtPrice(lim.monthly_price)}`}
                    </p>
                  </div>
                  <Select
                    value={u.storage_package ?? "none"}
                    onValueChange={(v) => pkgM.mutate({ organizationId: u.organization_id, code: v === "none" ? null : v })}
                  >
                    <SelectTrigger className="h-9 w-[220px]" aria-label={`Pacote de ${u.organization}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Só o Plano Core</SelectItem>
                      {packages.filter((p) => !p.is_base).map((p) => (
                        <SelectItem key={p.code} value={p.code}>
                          Plano Core + {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <OrgUsageSummary
                  packages={packages}
                  extraCode={u.storage_package}
                  database_mb={u.database_mb}
                  storage_mb={u.storage_mb}
                />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
