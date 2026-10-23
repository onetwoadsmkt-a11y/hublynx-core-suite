import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle, ChevronDown, FileSpreadsheet, Filter, Flame, Loader2, RotateCcw, Snowflake, Sun, Tag, X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLeadsReport } from "@/lib/pipeline/report.functions";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useIsMobile } from "@/hooks/use-mobile";
import { exportLeadsReportToExcel } from "@/lib/pipeline/export-report";
import { DEFAULT_FIELDS, LEAD_FIELDS, type LeadFieldKey } from "@/lib/pipeline/report-fields";
import {
  applyReportFilters, EMPTY_FILTERS, taskStatsByLead, type ReportFilters, type Temperature,
} from "@/lib/pipeline/report-filters";
import { openLeadCard } from "@/components/pipeline/LeadCardHost";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatório comercial — Hublynx Core" },
      { name: "description", content: "Relatório comercial com filtros por pipeline, etapa, temperatura, tags e tarefas, com exportação em Excel." },
      { property: "og:title", content: "Relatório comercial — Hublynx Core" },
      { property: "og:description", content: "Filtre leads por etapa, temperatura, tags e tarefas e exporte em Excel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosComerciaisPage,
});

const GROUPS = ["Contato", "Comercial", "Trackeamento", "Datas"] as const;
const TEMPS: { key: Temperature; label: string; icon: typeof Flame; tone: string }[] = [
  { key: "quente", label: "Quente", icon: Flame, tone: "data-[on=true]:bg-rose-600 data-[on=true]:text-white data-[on=true]:border-rose-600" },
  { key: "morno", label: "Morno", icon: Sun, tone: "data-[on=true]:bg-amber-500 data-[on=true]:text-white data-[on=true]:border-amber-500" },
  { key: "frio", label: "Frio", icon: Snowflake, tone: "data-[on=true]:bg-sky-600 data-[on=true]:text-white data-[on=true]:border-sky-600" },
];
const TEMP_LABEL: Record<string, string> = { quente: "Quente", morno: "Morno", frio: "Frio" };
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Seção recolhível do painel de filtros (o "submenu" de cada opção). */
function FilterSection({ title, count, children, defaultOpen = true }: { title: string; count?: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b py-3 last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <span>{title}{count ? <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{count}</span> : null}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function RelatoriosComerciaisPage() {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [fields, setFields] = useState<LeadFieldKey[]>(DEFAULT_FIELDS);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeJourney, setIncludeJourney] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const reportFn = useServerFn(getLeadsReport);
  const { activeOrganizationId, isLoading: wsLoading } = useWorkspace();
  const { data, isFetching } = useQuery({
    queryKey: ["leads-report", from, to, activeOrganizationId ?? "none"],
    queryFn: () =>
      reportFn({
        data: {
          pipelineId: null,
          from: from || null,
          to: to || null,
          ...(activeOrganizationId ? { organizationId: activeOrganizationId } : {}),
        },
      }),
    enabled: !wsLoading,
  });

  const pipelines = data?.pipelines ?? [];
  const stages = data?.stages ?? [];
  const allTags = (data as any)?.tags ?? [];
  const stats = useMemo(() => taskStatsByLead((data as any)?.leadTasks ?? []), [data]);
  const stagePipeline = useMemo(() => new Map(stages.map((s) => [s.id, s.pipeline_id])), [stages]);
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const leads = useMemo(() => {
    if (!data) return [];
    return applyReportFilters(data.leads as any[], filters, {
      stagePipeline,
      stats,
      wonStageIds: new Set((data as any).wonStageIds ?? []),
      wonTagSlugs: new Set((data as any).wonTagSlugs ?? []),
    });
  }, [data, filters, stagePipeline, stats]);

  // Etapas do pipeline escolhido (ou todas, agrupadas por pipeline).
  const stageGroups = useMemo(() => {
    const list = filters.pipelineId ? pipelines.filter((p) => p.id === filters.pipelineId) : pipelines;
    return list.map((p) => ({ pipeline: p, stages: stages.filter((s) => s.pipeline_id === p.id) })).filter((g) => g.stages.length);
  }, [pipelines, stages, filters.pipelineId]);

  // Tags únicas (mesmo slug em pipelines diferentes aparece uma vez).
  const tagOptions = useMemo(() => {
    const scoped = filters.pipelineId ? allTags.filter((t: any) => t.pipeline_id === filters.pipelineId) : allTags;
    const seen = new Map<string, { slug: string; name: string; color: string }>();
    for (const t of scoped) if (t.active !== false && !seen.has(t.slug.toLowerCase())) seen.set(t.slug.toLowerCase(), t);
    const q = tagQuery.trim().toLowerCase();
    return [...seen.values()].filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [allTags, filters.pipelineId, tagQuery]);

  const kpis = useMemo(() => {
    let value = 0, overdue = 0, none = 0, hot = 0;
    for (const l of leads as any[]) {
      value += Number(l.value ?? 0);
      const s = stats.get(l.id);
      if (s?.overdue) overdue++;
      if (!s || s.open === 0) none++;
      if (l.temperature === "quente") hot++;
    }
    return { value, overdue, none, hot };
  }, [leads, stats]);

  const set = <K extends keyof ReportFilters>(k: K, v: ReportFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const toggleIn = <K extends "stageIds" | "temperatures" | "tags">(k: K, v: string) =>
    setFilters((f) => {
      const arr = f[k] as string[];
      return { ...f, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });
  const activeCount =
    (filters.pipelineId ? 1 : 0) + filters.stageIds.length + filters.temperatures.length + filters.tags.length +
    (filters.overdueTasks ? 1 : 0) + (filters.noTasks ? 1 : 0) + (filters.situation !== "todos" ? 1 : 0) + (from || to ? 1 : 0);
  const clearAll = () => { setFilters(EMPTY_FILTERS); setFrom(""); setTo(""); };

  async function handleExport() {
    if (!data) return;
    if (fields.length === 0) { toast.error("Selecione ao menos um campo"); return; }
    setExporting(true);
    try {
      const ids = new Set((leads as any[]).map((l) => l.id));
      exportLeadsReportToExcel(
        {
          leads: leads as any,
          stages: data.stages,
          pipelines: data.pipelines,
          notes: data.notes.filter((n) => ids.has(n.lead_id)),
          events: data.events.filter((e) => ids.has(e.lead_id)),
          taskStats: stats,
        },
        { fields, includeNotes, includeJourney, filename: `relatorio-comercial-${new Date().toISOString().slice(0, 10)}.xlsx` },
      );
      toast.success(`Relatório exportado (${leads.length} leads)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const panel = (
    <div className="text-sm">
      <div className="flex items-center justify-between pb-2">
        <p className="flex items-center gap-1.5 font-semibold"><Filter className="h-4 w-4" /> Filtros</p>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAll}><RotateCcw className="mr-1 h-3 w-3" /> Limpar</Button>
        )}
      </div>

      <FilterSection title="Situação" count={filters.situation !== "todos" ? 1 : 0}>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {([["todos", "Todos"], ["leads", "Leads"], ["ganhos", "Clientes"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => set("situation", k)}
              className={cn("rounded-md px-2 py-1 text-xs font-medium", filters.situation === k ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {l}
            </button>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Pipeline" count={filters.pipelineId ? 1 : 0}>
        <Select value={filters.pipelineId ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, pipelineId: v === "all" ? null : v, stageIds: [], tags: [] }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os pipelines</SelectItem>
            {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterSection>

      <FilterSection title="Etapas" count={filters.stageIds.length}>
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {stageGroups.map((g) => (
            <div key={g.pipeline.id} className="space-y-1.5">
              {!filters.pipelineId && <p className="text-[11px] font-medium text-muted-foreground">{g.pipeline.name}</p>}
              {g.stages.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <Checkbox checked={filters.stageIds.includes(s.id)} onCheckedChange={() => toggleIn("stageIds", s.id)} />
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color || "#64748b" }} />
                  <span className="truncate">{s.name}</span>
                  {s.is_won && <Badge variant="secondary" className="ml-auto h-4 px-1 text-[9px]">ganho</Badge>}
                </label>
              ))}
            </div>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Temperatura" count={filters.temperatures.length}>
        <div className="flex flex-wrap gap-1.5">
          {TEMPS.map(({ key, label, icon: Icon, tone }) => (
            <button key={key} data-on={filters.temperatures.includes(key)} onClick={() => toggleIn("temperatures", key)}
              className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition", tone)}>
              <Icon className="h-3 w-3" /> {label}
            </button>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Tarefas" count={(filters.overdueTasks ? 1 : 0) + (filters.noTasks ? 1 : 0)}>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <Checkbox checked={filters.overdueTasks} onCheckedChange={(v) => set("overdueTasks", v === true)} />
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Leads com tarefas atrasadas
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={filters.noTasks} onCheckedChange={(v) => set("noTasks", v === true)} />
            Leads sem tarefas em aberto
          </label>
        </div>
      </FilterSection>

      <FilterSection title="Tags" count={filters.tags.length}>
        <Input value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder="Buscar tag…" className="mb-2 h-8 text-xs" />
        {filters.tags.length > 1 && (
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-xs">
            {([["any", "Qualquer uma"], ["all", "Todas"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => set("tagMode", k)}
                className={cn("rounded-md px-2 py-1 font-medium", filters.tagMode === k ? "bg-background shadow-sm" : "text-muted-foreground")}>{l}</button>
            ))}
          </div>
        )}
        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {tagOptions.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma tag configurada.</p>}
          {tagOptions.map((t) => (
            <label key={t.slug} className="flex items-center gap-2">
              <Checkbox checked={filters.tags.includes(t.slug)} onCheckedChange={() => toggleIn("tags", t.slug)} />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
              <span className="truncate">{t.name}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Período de entrada" count={from || to ? 1 : 0} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </FilterSection>
    </div>
  );

  const chips: { label: string; clear: () => void }[] = [
    ...(filters.situation !== "todos" ? [{ label: filters.situation === "leads" ? "Leads" : "Clientes", clear: () => set("situation", "todos") }] : []),
    ...(filters.pipelineId ? [{ label: pipelines.find((p) => p.id === filters.pipelineId)?.name ?? "Pipeline", clear: () => setFilters((f) => ({ ...f, pipelineId: null, stageIds: [], tags: [] })) }] : []),
    ...filters.stageIds.map((id) => ({ label: stageById.get(id)?.name ?? "Etapa", clear: () => toggleIn("stageIds", id) })),
    ...filters.temperatures.map((t) => ({ label: TEMP_LABEL[t], clear: () => toggleIn("temperatures", t) })),
    ...(filters.overdueTasks ? [{ label: "Tarefas atrasadas", clear: () => set("overdueTasks", false) }] : []),
    ...(filters.noTasks ? [{ label: "Sem tarefas", clear: () => set("noTasks", false) }] : []),
    ...filters.tags.map((t) => ({ label: `#${allTags.find((x: any) => x.slug === t)?.name ?? t}`, clear: () => toggleIn("tags", t) })),
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Relatório comercial</h1>
          <p className="text-sm text-muted-foreground">Escolha os filtros, confira a prévia e exporte em Excel.</p>
        </div>
        <div className="flex gap-2">
          {isMobile && (
            <Button variant="outline" onClick={() => setFiltersOpen(true)}>
              <Filter className="mr-2 h-4 w-4" /> Filtros{activeCount ? ` (${activeCount})` : ""}
            </Button>
          )}
          <Button onClick={handleExport} disabled={exporting || isFetching || !data || leads.length === 0}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            Exportar Excel
          </Button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {!isMobile && <Card className="h-fit p-4 lg:sticky lg:top-4">{panel}</Card>}

        <div className="min-w-0 space-y-4">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <button key={i} onClick={c.clear} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20">
                  {c.label} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Leads no filtro", value: String(leads.length) },
              { label: "Valor total", value: brl(kpis.value) },
              { label: "Quentes", value: String(kpis.hot) },
              { label: "Com tarefa atrasada", value: String(kpis.overdue), danger: kpis.overdue > 0 },
              { label: "Sem tarefas", value: String(kpis.none) },
            ].map((k) => (
              <Card key={k.label} className="p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className={cn("mt-1 text-xl font-semibold tabular-nums", k.danger && "text-destructive")}>{k.value}</p>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <p className="text-sm font-semibold">Prévia</p>
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-4 py-2 font-medium">Lead</th>
                    <th className="px-4 py-2 font-medium">Etapa</th>
                    <th className="hidden px-4 py-2 font-medium md:table-cell">Temperatura</th>
                    <th className="hidden px-4 py-2 font-medium lg:table-cell">Tags</th>
                    <th className="px-4 py-2 text-right font-medium">Tarefas</th>
                  </tr>
                </thead>
                <tbody>
                  {(leads as any[]).slice(0, 200).map((l) => {
                    const s = stats.get(l.id);
                    return (
                      <tr key={l.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => openLeadCard(l.id)}>
                        <td className="max-w-[220px] px-4 py-2">
                          <p className="truncate font-medium">{l.name}</p>
                          {l.company && <p className="truncate text-xs text-muted-foreground">{l.company}</p>}
                        </td>
                        <td className="px-4 py-2 text-xs">{l.stage_id ? stageById.get(l.stage_id)?.name ?? "—" : "—"}</td>
                        <td className="hidden px-4 py-2 text-xs md:table-cell">{TEMP_LABEL[l.temperature] ?? "—"}</td>
                        <td className="hidden max-w-[220px] px-4 py-2 lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {(l.tags ?? []).slice(0, 4).map((t: string) => (
                              <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]"><Tag className="h-2.5 w-2.5" />{t}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-xs tabular-nums">
                          {s?.overdue ? <span className="font-semibold text-destructive">{s.overdue} atrasada(s)</span> : s?.open ? `${s.open} em aberto` : <span className="text-muted-foreground">sem tarefas</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {leads.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">{isFetching ? "Carregando…" : "Nenhum lead com esses filtros."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {leads.length > 200 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Mostrando 200 de {leads.length}. A exportação leva todos.</p>}
          </Card>

          <Card className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">Colunas da planilha</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setFields(DEFAULT_FIELDS)}>Selecionar tudo</Button>
                <Button size="sm" variant="ghost" onClick={() => setFields([])}>Limpar</Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {GROUPS.map((group) => (
                <div key={group} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                  {LEAD_FIELDS.filter((f) => f.group === group).map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={fields.includes(f.key)} onCheckedChange={() => setFields((cur) => (cur.includes(f.key) ? cur.filter((k) => k !== f.key) : [...cur, f.key]))} />
                      {f.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <Separator />
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeNotes} onCheckedChange={(v) => setIncludeNotes(v === true)} />
                Incluir anotações (aba dedicada)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeJourney} onCheckedChange={(v) => setIncludeJourney(v === true)} />
                Incluir histórico de jornada (aba dedicada)
              </label>
            </div>
          </Card>
        </div>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl">
          <SheetHeader className="sr-only"><SheetTitle>Filtros do relatório</SheetTitle></SheetHeader>
          {panel}
          <Button className="mt-3 w-full" onClick={() => setFiltersOpen(false)}>Ver {leads.length} leads</Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
