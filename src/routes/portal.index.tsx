import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CalendarDays, CheckCircle2, ListChecks } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { PortalShell, usePortalSession } from "@/components/portal/PortalShell";
import { portalMyProjects } from "@/lib/portal/portal.functions";

export const Route = createFileRoute("/portal/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Meus projetos — Portal do cliente" }] }),
  component: PortalHome,
});

function fmt(d?: string | null) {
  return d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
}

function PortalHome() {
  const session = usePortalSession();
  const listFn = useServerFn(portalMyProjects);
  const q = useQuery({
    queryKey: ["portal-projects"],
    queryFn: () => session.call((token) => listFn({ data: { token } })),
    enabled: session.ready,
    refetchInterval: 60_000,
  });
  const projects = q.data ?? [];

  // Um projeto só: abre direto o roadmap dele.
  useEffect(() => {
    if (q.data && q.data.length === 1) {
      const only = q.data[0];
      window.location.replace(`/portal/${only.slug || only.id}`);
    }
  }, [q.data]);

  const brand = projects[0]?.organization ?? null;

  return (
    <PortalShell brand={brand} title="Meus projetos" session={session}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {session.name ? `Olá, ${session.name.split(" ")[0]}` : "Seus projetos"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe o andamento e marque como concluídas as etapas que são sua responsabilidade.
        </p>
      </div>

      {!session.ready || q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : q.isError ? (
        <Card className="p-6 text-sm text-rose-600">
          Não foi possível carregar seus projetos. Tente novamente.
        </Card>
      ) : projects.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-medium">Nenhum projeto liberado para você ainda.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Quando a equipe liberar o acesso, ele aparece aqui. Se você faz parte da equipe, use o
            painel principal.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/dashboard">Ir para o painel da equipe</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              to="/portal/$projectId"
              params={{ projectId: p.slug || p.id }}
              className="group"
            >
              <Card className="h-full p-5 transition hover:border-primary/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  {p.logo_url && (
                    <img
                      src={p.logo_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg border bg-white object-contain p-0.5"
                    />
                  )}
                  <h2 className="min-w-0 flex-1 font-display font-semibold leading-tight">
                    {p.number ? `Nº ${p.number} · ` : ""}
                    {p.name}
                  </h2>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-muted-foreground">Andamento</span>
                    <span className="font-semibold tabular-nums">
                      {Math.round(Number(p.progress) || 0)}%
                    </span>
                  </div>
                  <Progress value={Number(p.progress) || 0} className="h-2" />
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {p.stages_done}/{p.stages_total} etapas
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" /> {fmt(p.start_date)} → {fmt(p.due_date)}
                  </span>
                  {p.my_open_tasks > 0 && (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                      <ListChecks className="h-3.5 w-3.5" /> {p.my_open_tasks} pendência(s) suas
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
