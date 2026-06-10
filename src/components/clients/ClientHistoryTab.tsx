import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getClientRelated } from "@/lib/clients/clients.functions";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ClientHistoryTab({ clientId }: { clientId: string }) {
  const fn = useServerFn(getClientRelated);
  const { data, isLoading } = useQuery({
    queryKey: ["client-related", clientId],
    queryFn: () => fn({ data: { clientId } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const projects = data?.projects ?? [];
  const tasks = data?.tasks ?? [];
  const finances = data?.finances ?? [];

  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-sm font-semibold mb-2">Projetos ({projects.length})</h4>
        {projects.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum projeto vinculado.</p>
        ) : (
          <ul className="space-y-1">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50 text-sm">
                <Link to="/projetos" className="hover:underline truncate">
                  {p.name}
                </Link>
                <Badge variant="outline">{p.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Separator />
      <section>
        <h4 className="text-sm font-semibold mb-2">Tarefas ({tasks.length})</h4>
        {tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma tarefa vinculada.</p>
        ) : (
          <ul className="space-y-1">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50 text-sm">
                <Link
                  to="/tarefas"
                  search={{ task: t.id } as never}
                  className="hover:underline truncate"
                >
                  {t.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {t.due_date ? format(new Date(t.due_date), "dd/MM", { locale: ptBR }) : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Separator />
      <section>
        <h4 className="text-sm font-semibold mb-2">Lançamentos financeiros ({finances.length})</h4>
        {finances.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum lançamento vinculado.</p>
        ) : (
          <ul className="space-y-1">
            {finances.map((f) => (
              <li key={f.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50 text-sm">
                <Link to="/financeiro" className="hover:underline truncate">
                  {f.description ?? "Lançamento"}
                </Link>
                <span className={f.kind === "receita" ? "text-emerald-600" : "text-rose-600"}>
                  R$ {Number(f.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
