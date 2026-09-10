import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { listUsage, recalcUsage } from "@/lib/platform/platform.functions";

export const Route = createFileRoute("/_authenticated/admin/armazenamento")({
  head: () => ({
    meta: [
      { title: "Armazenamento por empresa — Hublynx" },
      { name: "description", content: "Acompanhe arquivos, banco e usuários de cada empresa frente aos limites da faixa." },
      { property: "og:title", content: "Armazenamento por empresa — Hublynx" },
      { property: "og:description", content: "Uso de arquivos e banco por empresa, comparado aos limites contratados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoragePage,
});

function pct(used: number, limit: number | null) {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function StoragePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsage);
  const recalcFn = useServerFn(recalcUsage);

  const q = useQuery({ queryKey: ["platform-usage"], queryFn: () => listFn(), staleTime: 60_000 });

  const recalcM = useMutation({
    mutationFn: () => recalcFn({}),
    onSuccess: () => {
      toast.success("Uso recalculado");
      qc.invalidateQueries({ queryKey: ["platform-usage"] });
      qc.invalidateQueries({ queryKey: ["platform-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Armazenamento</h1>
          <p className="text-sm text-muted-foreground">
            Arquivos e volume de dados de cada empresa, comparados com a faixa de recursos.
          </p>
        </div>
        <Button variant="outline" onClick={() => recalcM.mutate()} disabled={recalcM.isPending}>
          <RefreshCw className={`h-4 w-4 ${recalcM.isPending ? "animate-spin" : ""}`} /> Recalcular
        </Button>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((u) => (
            <Card key={u.organization_id} className="rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{u.organization}</p>
                <p className="text-xs text-muted-foreground">
                  {u.tier ?? "Sem faixa"} · {u.users_count} de {u.contracted_users} usuário(s)
                  {u.measured_at
                    ? ` · medido em ${new Date(u.measured_at).toLocaleDateString("pt-BR")}`
                    : " · nunca medido"}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Arquivos</span>
                  <span>
                    {u.storage_mb.toFixed(1)} MB{u.storage_limit_mb ? ` / ${u.storage_limit_mb} MB` : ""}
                  </span>
                </div>
                <Progress value={pct(u.storage_mb, u.storage_limit_mb)} />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Banco de dados (estimado)</span>
                  <span>
                    {u.database_mb.toFixed(1)} MB{u.database_limit_mb ? ` / ${u.database_limit_mb} MB` : ""}
                  </span>
                </div>
                <Progress value={pct(u.database_mb, u.database_limit_mb)} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
