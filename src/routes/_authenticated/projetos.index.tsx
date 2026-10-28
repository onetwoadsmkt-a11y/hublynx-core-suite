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
  SlidersHorizontal,
  ClipboardList,
  ChevronRight,
} from "lucide-react";
import { AppLink } from "@/components/AppLink";
import { useMyTasks } from "@/hooks/useMyTasks";
import { cn } from "@/lib/utils";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { maskBRL } from "@/lib/security/value-lock";

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
  return maskBRL(n);
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const navigate = useNavigate();
  const mine = useMyTasks();

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
  const extraFilters = [clientFilter !== "all", !!startFrom, !!dueUntil].filter(Boolean).length;
  // contagem por status (atalhos do celular)
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of all as any[]) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return m;
  }, [all]);

  const clearFilters = () => {
    setSearch("");
    setClientFilter("all");
    setStatusFilter("all");
    setStartFrom("");
    setDueUntil("");
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 sm:space-y-6 md:p-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl sm:font-semibold">Projetos</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Command center para acompanhar todos os seus projetos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-md border bg-background p-0.5 sm:inline-flex">
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
          <Button onClick={() => setOpen(true)} className="h-11 rounded-xl sm:h-10 sm:rounded-md">
            <Plus className="h-4 w-4" /> <span className="sm:hidden">Novo</span><span className="hidden sm:inline">Novo projeto</span>
          </Button>
        </div>
      </div>

      {/* Celular: atalho para as tarefas designadas a mim */}
      {mine.open > 0 && (
        <AppLink
          href="/minhas-tarefas"
          className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-[0_1px_2px_rgba(10,37,87,.06),0_8px_24px_rgba(10,37,87,.06)] md:hidden"
        >
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", mine.late ? "bg-rose-100 text-rose-700" : "bg-primary/10 text-primary")}>
            <ClipboardList className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">Minhas tarefas</span>
            <span className="block text-[13px] text-muted-foreground">
              {mine.late > 0 && <strong className="text-rose-700">{mine.late} atrasada{mine.late > 1 ? "s" : ""}</strong>}
              {mine.late > 0 && " · "}
              {mine.today} para hoje · {mine.open} em aberto
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </AppLink>
      )}

      <Card className="rounded-2xl border-0 bg-transparent p-0 shadow-none md:border md:bg-card md:p-4 md:shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          <div className="flex gap-2 lg:col-span-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar projeto ou cliente"
                aria-label="Buscar projeto ou cliente"
                className="h-11 rounded-xl bg-card pl-9 text-[15px] md:h-10 md:rounded-md md:text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="relative h-11 w-11 shrink-0 rounded-xl bg-card p-0 md:hidden"
              aria-label={`Filtros${extraFilters ? `, ${extraFilters} ativo(s)` : ""}`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {extraFilters > 0 && (
                <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{extraFilters}</span>
              )}
            </Button>
          </div>
          <div className={cn("contents", !filtersOpen && "max-md:hidden")}>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="max-md:h-11 max-md:rounded-xl max-md:bg-card">
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
            <SelectTrigger className="max-md:h-11 max-md:rounded-xl max-md:bg-card">
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
        </div>
        {/* Celular: atalhos de status */}
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden" role="group" aria-label="Status">
          {(["all", "ativo", "aguardando_cliente", "planejamento", "em_pausa", "concluido"] as const)
            .filter((k) => k === "all" || statusCounts.get(k))
            .map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={statusFilter === k}
                onClick={() => setStatusFilter(k)}
                className={cn(
                  "h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold",
                  statusFilter === k ? "border-transparent bg-[var(--brand-dark,#0a2557)] text-white" : "bg-card",
                )}
              >
                {k === "all" ? `Todos ${all.length}` : `${STATUS_LABEL[k]} ${statusCounts.get(k)}`}
              </button>
            ))}
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

      {!q.isLoading && projects.length > 0 && (
        <div className={cn("grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3", view === "list" && "sm:hidden")}>
          {projects.map((p: any) => {
            const stats = p.task_stats ?? { total: 0, done: 0, overdue: 0 };
            const stageStats = p.stage_stats ?? { total: 0, done: 0, percent: 0 };
            const progress = stageStats.total ? stageStats.percent : p.progress ?? 0;
            return (
              <Card
                key={p.id}
                role="link"
                tabIndex={0}
                aria-label={`Abrir projeto ${p.name}`}
                className="cursor-pointer rounded-2xl border-0 p-4 shadow-[0_1px_2px_rgba(10,37,87,.06),0_8px_24px_rgba(10,37,87,.06)] transition-shadow hover:shadow-lg sm:border sm:border-l-4 sm:p-5"
                style={{ borderLeftColor: p.color || "#6366f1" }}
                onClick={() => navigate({ to: "/projetos/$id", params: { id: p.id } })}
                onKeyDown={(e) => { if (e.key === "Enter") navigate({ to: "/projetos/$id", params: { id: p.id } }); }}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white sm:hidden"
                    style={{ background: p.color || "#6366f1" }}
                    aria-hidden="true"
                  >
                    {String(p.name).replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    {p.client && (
                      <p className="truncate text-xs text-muted-foreground sm:hidden">
                        {p.project_number ? `Nº ${p.project_number} · ` : ""}{p.client.name}
                      </p>
                    )}
                    <h3 className="line-clamp-2 text-base font-bold leading-snug sm:truncate sm:text-sm sm:font-semibold">{p.name}</h3>
                    {p.client && (
                      <p className="text-xs text-muted-foreground mt-0.5 hidden truncate sm:block">
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

                <div className="mt-3.5 sm:mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span><strong className="text-foreground sm:font-normal sm:text-muted-foreground">{progress}%</strong> concluído</span>
                    <span>
                      {stageStats.total
                        ? `${stageStats.done}/${stageStats.total} etapas`
                        : "sem etapas"}
                    </span>
                  </div>
                  <Progress value={progress} className="h-2 sm:h-1.5" />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs sm:mt-4">
                  <span className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-2 py-1 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {p.due_date ? `Até ${new Date(p.due_date).toLocaleDateString("pt-BR")}` : "Sem prazo"}
                  </span>
                  {p.contract_value ? (
                    <span className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-2 py-1 text-muted-foreground">
                      <UsersIcon className="h-3.5 w-3.5" />
                      {brl(Number(p.contract_value))}
                    </span>
                  ) : null}
                  <span
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${stats.overdue > 0 ? "bg-rose-50 font-semibold text-rose-700" : "bg-muted/60 text-muted-foreground"}`}
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    {stats.overdue} atrasada{stats.overdue !== 1 ? "s" : ""}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!q.isLoading && projects.length > 0 && view === "list" && (
        <Card className="hidden rounded-2xl overflow-hidden sm:block">
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
                const stageStats = p.stage_stats ?? { total: 0, done: 0, percent: 0 };
                const progress = stageStats.total ? stageStats.percent : p.progress ?? 0;
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
