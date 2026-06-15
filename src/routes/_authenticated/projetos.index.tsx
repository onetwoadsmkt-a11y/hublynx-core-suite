import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listProjects, type ProjectStatus } from "@/lib/projects/projects.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Search,
  Calendar,
  Users as UsersIcon,
  AlertCircle,
  LayoutGrid,
  List as ListIcon,
  X,
} from "lucide-react";
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

type ViewMode = "grid" | "list";

function ProjectsList() {
  const listFn = useServerFn(listProjects);
  const q = useQuery({ queryKey: ["projects"], queryFn: () => listFn() });
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startFrom, setStartFrom] = useState<string>("");
  const [dueUntil, setDueUntil] = useState<string>("");
  const [view, setView] = useState<ViewMode>("grid");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const all = q.data?.projects ?? [];

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    all.forEach((p: any) => {
      if (p.client?.id) map.set(p.client.id, p.client.name);
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [all]);

  const projects = all.filter((p: any) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (clientFilter !== "all" && p.client?.id !== clientFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (startFrom && (!p.start_date || p.start_date < startFrom)) return false;
    if (dueUntil && (!p.due_date || p.due_date > dueUntil)) return false;
    return true;
  });

  const hasFilters =
    search || clientFilter !== "all" || statusFilter !== "all" || startFrom || dueUntil;

  const clearFilters = () => {
    setSearch("");
    setClientFilter("all");
    setStatusFilter("all");
    setStartFrom("");
    setDueUntil("");
  };

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
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <Button
              size="sm"
              variant={view === "grid" ? "secondary" : "ghost"}
              onClick={() => setView("grid")}
              className="h-8 px-2"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={view === "list" ? "secondary" : "ghost"}
              onClick={() => setView("list")}
              className="h-8 px-2"
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Novo projeto
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar projetos..."
              className="pl-9"
            />
          </div>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clientOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Início a partir de</label>
            <Input type="date" value={startFrom} onChange={(e) => setStartFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Prazo até</label>
            <Input type="date" value={dueUntil} onChange={(e) => setDueUntil(e.target.value)} />
          </div>
        </div>
        {hasFilters && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {projects.length} de {all.length} projetos
            </span>
            <Button size="sm" variant="ghost" onClick={clearFilters} className="h-7">
              <X className="h-3 w-3" /> Limpar filtros
            </Button>
          </div>
        )}
      </Card>

      {q.isLoading && <div className="text-muted-foreground">Carregando...</div>}
      {!q.isLoading && projects.length === 0 && (
        <Card className="rounded-2xl p-12 text-center">
          <p className="text-lg font-medium">Nenhum projeto encontrado</p>
          <p className="text-sm text-muted-foreground mt-1">
            Ajuste os filtros ou crie um novo projeto.
          </p>
          <Button className="mt-4" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Criar projeto
          </Button>
        </Card>
      )}

      {!q.isLoading && projects.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p: any) => {
            const stats = p.task_stats ?? { total: 0, done: 0, overdue: 0 };
            const progress = stats.total
              ? Math.round((stats.done / stats.total) * 100)
              : p.progress ?? 0;
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
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {p.client.name}
                      </p>
                    )}
                  </div>
                  <Badge
                    className={`${STATUS_TONE[p.status as ProjectStatus]} border`}
                    variant="outline"
                  >
                    {STATUS_LABEL[p.status as ProjectStatus]}
                  </Badge>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>{progress}% concluído</span>
                    <span>
                      {stats.done}/{stats.total} tarefas
                    </span>
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
                  <div
                    className={`flex items-center gap-1.5 ${stats.overdue > 0 ? "text-rose-600" : "text-muted-foreground"}`}
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    {stats.overdue} atrasada{stats.overdue !== 1 ? "s" : ""}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!q.isLoading && projects.length > 0 && view === "list" && (
        <Card className="rounded-2xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projeto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[180px]">Progresso</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p: any) => {
                const stats = p.task_stats ?? { total: 0, done: 0, overdue: 0 };
                const progress = stats.total
                  ? Math.round((stats.done / stats.total) * 100)
                  : p.progress ?? 0;
                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/projetos/$id", params: { id: p.id } })}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: p.color || "#6366f1" }}
                        />
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.client?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`${STATUS_TONE[p.status as ProjectStatus]} border`}
                        variant="outline"
                      >
                        {STATUS_LABEL[p.status as ProjectStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground w-10 text-right">
                          {progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.start_date ? new Date(p.start_date).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.due_date ? new Date(p.due_date).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.contract_value ? brl(Number(p.contract_value)) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <ProjectFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
