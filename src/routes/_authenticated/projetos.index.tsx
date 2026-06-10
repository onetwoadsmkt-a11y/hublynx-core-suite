import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listProjects, type ProjectStatus } from "@/lib/projects/projects.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Search, Calendar, Users as UsersIcon, AlertCircle } from "lucide-react";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";

export const Route = createFileRoute("/_authenticated/projetos/")({
  head: () => ({ meta: [{ title: "Projetos — Hublynx Core" }] }),
  component: ProjectsList,
});

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planejamento: "Planejamento",
  ativo: "Ativo",
  aguardando_cliente: "Aguardando Cliente",
  em_pausa: "Em Pausa",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
const STATUS_TONE: Record<ProjectStatus, string> = {
  planejamento: "bg-blue-50 text-blue-700 border-blue-200",
  ativo: "bg-emerald-50 text-emerald-700 border-emerald-200",
  aguardando_cliente: "bg-amber-50 text-amber-700 border-amber-200",
  em_pausa: "bg-slate-100 text-slate-700 border-slate-200",
  concluido: "bg-violet-50 text-violet-700 border-violet-200",
  cancelado: "bg-rose-50 text-rose-700 border-rose-200",
};

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function ProjectsList() {
  const listFn = useServerFn(listProjects);
  const q = useQuery({ queryKey: ["projects"], queryFn: () => listFn() });
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const projects = (q.data?.projects ?? []).filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Command center para acompanhar todos os seus projetos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar projetos..." className="pl-9 w-64" />
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo projeto</Button>
        </div>
      </div>

      {q.isLoading && <div className="text-muted-foreground">Carregando...</div>}
      {!q.isLoading && projects.length === 0 && (
        <Card className="rounded-2xl p-12 text-center">
          <p className="text-lg font-medium">Nenhum projeto ainda</p>
          <p className="text-sm text-muted-foreground mt-1">Crie seu primeiro projeto para começar.</p>
          <Button className="mt-4" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Criar projeto</Button>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((p: any) => {
          const stats = p.task_stats ?? { total: 0, done: 0, overdue: 0 };
          const progress = stats.total ? Math.round((stats.done / stats.total) * 100) : p.progress ?? 0;
          return (
            <Card
              key={p.id}
              className="rounded-2xl p-5 hover:shadow-lg transition-shadow cursor-pointer border-l-4"
              style={{ borderLeftColor: p.color || "#6366f1" }}
              onClick={() => navigate({ to: "/projetos/$id", params: { id: p.id } })}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{p.name}</h3>
                  {p.client && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.client.name}</p>
                  )}
                </div>
                <Badge className={`${STATUS_TONE[p.status as ProjectStatus]} border`} variant="outline">
                  {STATUS_LABEL[p.status as ProjectStatus]}
                </Badge>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{progress}% concluído</span>
                  <span>{stats.done}/{stats.total} tarefas</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {p.due_date ? new Date(p.due_date).toLocaleDateString("pt-BR") : "—"}
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <UsersIcon className="h-3.5 w-3.5" />
                  {p.contract_value ? brl(Number(p.contract_value)) : "—"}
                </div>
                <div className={`flex items-center gap-1.5 ${stats.overdue > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                  <AlertCircle className="h-3.5 w-3.5" />
                  {stats.overdue} atrasada{stats.overdue !== 1 ? "s" : ""}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <ProjectFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
