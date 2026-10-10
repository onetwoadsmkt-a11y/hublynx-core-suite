import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { listProjectStages } from "@/lib/projects/stages.functions";
import { Progress } from "@/components/ui/progress";

const statusLabels: Record<string, string> = {
  not_started: "Não iniciada", in_progress: "Em andamento", waiting: "Aguardando", blocked: "Bloqueada", done: "Concluída",
};

export function ProjectEvolution({ projectId, disabled, dueDate }: { projectId: string; disabled: boolean; dueDate: string | null }) {
  const list = useServerFn(listProjectStages);
  const query = useQuery({
    queryKey: ["project-stages", projectId],
    queryFn: () => list({ data: { project_id: projectId } }),
    enabled: !disabled,
    staleTime: 60_000,
  });
  const stages = query.data ?? [];
  const progress = stages.length ? Math.round(stages.reduce((sum, stage) => sum + stage.percent, 0) / stages.length) : 0;
  const done = stages.filter(stage => stage.status === "done").length;

  if (disabled) return <p className="py-8 text-sm text-muted-foreground">Evolução por etapas indisponível para projetos do tipo Mensal Recorrente.</p>;
  if (query.isLoading) return <p className="py-8 text-sm text-muted-foreground">Carregando evolução...</p>;
  if (query.isError) return <p className="py-8 text-sm text-destructive">Não foi possível carregar a evolução das etapas.</p>;

  return (
    <section className="space-y-8 py-4">
      <h2 className="text-xl font-semibold">Evolução do projeto</h2>
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {[
          { label: "Progresso do projeto", value: `${progress}%` },
          { label: "Etapas concluídas", value: `${done}/${stages.length}` },
          { label: "Etapas restantes", value: stages.length - done },
          { label: "Prazo do projeto", value: dueDate ? new Date(`${dueDate.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "Sem prazo" },
        ].map(metric => <div key={metric.label} className="min-w-0 border-b pb-4"><p className="text-sm text-muted-foreground">{metric.label}</p><p className="mt-2 text-2xl font-semibold">{metric.value}</p></div>)}
      </div>
      <Progress value={progress} aria-label="Progresso das etapas do projeto" className="h-2" />
      {stages.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma etapa definida para este projeto.</p> : <>
        <div>
          <h3 className="mb-5 font-semibold">Progresso por etapa</h3>
          <div className="w-full min-w-0" style={{ height: Math.max(280, stages.length * 54) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stages} layout="vertical" margin={{ top: 5, right: 24, bottom: 5, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fill: "var(--foreground)", fontSize: 12 }} tickFormatter={name => String(name).length > 15 ? `${String(name).slice(0, 14)}…` : String(name)} />
                <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", color: "var(--popover-foreground)", borderRadius: 8 }} formatter={value => [`${value}%`, "Progresso da etapa"]} />
                <Bar dataKey="percent" name="Progresso" fill="var(--chart-2)" radius={[0, 4, 4, 0]} maxBarSize={24} background={{ fill: "var(--muted)" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="font-semibold">Detalhamento das etapas</h3>
          {stages.map((stage, index) => <div key={stage.id} className="grid gap-3 border-b pb-4 sm:grid-cols-[minmax(0,1fr)_minmax(160px,1fr)]">
            <div className="min-w-0"><p className="break-words font-medium">{index + 1}. {stage.name}</p><p className="mt-1 text-xs text-muted-foreground">{statusLabels[stage.status]} · Prazo: {stage.due_date ? new Date(`${stage.due_date}T12:00:00`).toLocaleDateString("pt-BR") : "Sem prazo"}</p></div>
            <div className="self-center"><p className="mb-2 text-right text-sm font-semibold">{stage.percent}%</p><Progress value={stage.percent} className="h-2" /></div>
          </div>)}
        </div>
      </>}
    </section>
  );
}