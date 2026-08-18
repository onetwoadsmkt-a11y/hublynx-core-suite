import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getClientRelated } from "@/lib/clients/clients.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, FolderKanban } from "lucide-react";
import { maskBRL } from "@/lib/security/value-lock";

export function ClientProjectsTab({ clientId }: { clientId: string }) {
  const fn = useServerFn(getClientRelated);
  const { data, isLoading } = useQuery({
    queryKey: ["client-related", clientId],
    queryFn: () => fn({ data: { clientId } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const projects = data?.projects ?? [];
  const finances = data?.finances ?? [];
  const previsto = finances
    .filter((f) => f.kind === "receber")
    .reduce((a, f) => a + (Number(f.amount) || 0), 0);
  const recebido = finances
    .filter((f) => f.kind === "receber" && f.status === "pago")
    .reduce((a, f) => a + (Number(f.amount) || 0), 0);
  const emAberto = previsto - recebido;

  if (projects.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <FolderKanban className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Nenhum projeto vinculado a este lead.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Previsto</p>
          <p className="text-sm font-semibold tabular-nums">{maskBRL(previsto)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Recebido</p>
          <p className="text-sm font-semibold tabular-nums text-emerald-600">{maskBRL(recebido)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Em aberto</p>
          <p className="text-sm font-semibold tabular-nums text-amber-600">{maskBRL(emAberto)}</p>
        </div>
      </div>
      <h4 className="text-sm font-semibold">Projetos ({projects.length})</h4>

      <ul className="space-y-2">
        {projects.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 p-3 border rounded-lg hover:bg-muted/50"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">{p.name}</p>
              <Badge variant="outline" className="mt-1 text-xs">{p.status}</Badge>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/projetos/$id" params={{ id: p.id }}>
                Abrir <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
