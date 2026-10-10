import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, CalendarRange } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { leadScoreTone } from "@/components/pipeline/LeadCard";
import { useWorkspace } from "@/hooks/useWorkspace";
import { pipelineDashboard } from "@/lib/pipeline/dashboard.functions";
import { classifyStage, computeFunnel, countByTag } from "@/lib/pipeline/funnel";
import { maskBRL, useValuesUnlocked } from "@/lib/security/value-lock";
import { cn } from "@/lib/utils";

type Preset = 7 | 30 | 90 | "custom";

const DAY = 86_400_000;
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const brShort = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const brLong = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
const startOf = (s: string) => new Date(`${s}T00:00:00`).getTime();
const endOf = (s: string) => new Date(`${s}T23:59:59.999`).getTime();
const money = (v: number) => maskBRL(v, { notation: "compact", maximumFractionDigits: 1 });
const pct1 = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const fmtPct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function presetRange(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * DAY);
  return { from: isoDay(start), to: isoDay(end) };
}

/** Mesmo número de dias imediatamente antes do período (igual ao servidor). */
function previousRange(from: string, to: string) {
  const days = Math.max(1, Math.round((startOf(to) - startOf(from)) / DAY) + 1);
  const prevEnd = new Date(startOf(from) - DAY);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * DAY);
  return { from: isoDay(prevStart), to: isoDay(prevEnd), days };
}

/** Dashboard comercial: conversão, resultado, crescimento, kanban, tags, classificação e origem. */
export function SalesDashboard() {
  useValuesUnlocked(); // re-renderiza quando os valores são exibidos/ocultados
  const dashFn = useServerFn(pipelineDashboard);
  const { activeOrganizationId, activeOrganization, isLoading: wsLoading } = useWorkspace();

  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const [preset, setPreset] = useState<Preset>(30);
  const [range, setRange] = useState(() => presetRange(30));
  const [draft, setDraft] = useState(range);
  const [customOpen, setCustomOpen] = useState(false);
  const { from, to } = range;

  const { data, isLoading } = useQuery({
    queryKey: ["comercial-dashboard", pipelineId ?? "default", from, to, activeOrganizationId ?? "none"],
    queryFn: () =>
      dashFn({
        data: { pipelineId, from, to, ...(activeOrganizationId ? { organizationId: activeOrganizationId } : {}) },
      }),
    staleTime: 30_000,
    enabled: !wsLoading,
  });

  const pipelines = data?.pipelines ?? [];
  const current = data?.pipeline ?? null;
  const prevRange = previousRange(from, to);

  const metrics = useMemo(() => {
    const stages = data?.stages ?? [];
    const leads = data?.leads ?? [];
    const previousLeads = data?.previousLeads ?? [];
    const allLeads = data?.allLeads ?? [];
    const winEvents = data?.winEvents ?? [];
    const tags = (data?.tags ?? []).filter((t) => t.active !== false);

    const kindById = new Map(stages.map((s) => [s.id, classifyStage(s)]));
    const isWon = (stageId: string | null) => !!stageId && kindById.get(stageId) === "ganho";
    const isClosed = (stageId: string | null) => {
      const k = stageId ? kindById.get(stageId) : undefined;
      return k === "ganho" || k === "perdido" || k === "nutricao";
    };

    const opts = { tags, mode: "both" as const };
    const m = computeFunnel(stages, leads, opts);
    const prev = computeFunnel(stages, previousLeads, opts);
    const conv = pct1(m.ganhos, m.leads);
    const prevConv = pct1(prev.ganhos, prev.leads);

    // Data do ganho: última entrada numa etapa de ganho; sem histórico, conversão/atualização.
    const lastWin = new Map<string, number>();
    for (const e of winEvents) lastWin.set(e.lead_id, new Date(e.created_at).getTime());
    const won = allLeads
      .filter((l) => isWon(l.stage_id))
      .map((l) => ({
        at: lastWin.get(l.id) ?? new Date(l.converted_at ?? l.updated_at ?? l.created_at).getTime(),
        value: Number(l.value ?? 0),
      }));
    const closedIn = (a: number, b: number) => {
      const rows = won.filter((w) => w.at >= a && w.at <= b);
      return { count: rows.length, value: rows.reduce((acc, w) => acc + w.value, 0) };
    };
    const closed = closedIn(startOf(from), endOf(to));
    const prevClosed = closedIn(startOf(prevRange.from), endOf(prevRange.to));

    const open = allLeads.filter((l) => !isClosed(l.stage_id));
    const openValue = open.reduce((acc, l) => acc + Number(l.value ?? 0), 0);

    // Evolução: 12 janelas de 7 dias terminando hoje.
    const todayEnd = endOf(isoDay(new Date()));
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const end = todayEnd - (11 - i) * 7 * DAY;
      const start = end - 7 * DAY;
      const leadsN = allLeads.filter((l) => {
        const t = new Date(l.created_at).getTime();
        return t > start && t <= end;
      }).length;
      const ganhosN = won.filter((w) => w.at > start && w.at <= end).length;
      return {
        label: i === 11 ? "Atual" : brShort(new Date(start + DAY)),
        periodo: `${brShort(new Date(start + DAY))} a ${brShort(new Date(end))}`,
        leads: leadsN,
        ganhos: ganhosN,
      };
    });
    const sum = (a: typeof weeks) => a.reduce((acc, w) => acc + w.leads, 0);
    const last4 = sum(weeks.slice(8));
    const prev4 = sum(weeks.slice(4, 8));

    // Kanban (estado atual, sem filtro de data)
    const byStage = new Map<string, { count: number; total: number; periodo: number }>();
    for (const l of allLeads) {
      const key = l.stage_id ?? "sem-etapa";
      const acc = byStage.get(key) ?? { count: 0, total: 0, periodo: 0 };
      acc.count += 1;
      acc.total += Number(l.value ?? 0);
      byStage.set(key, acc);
    }
    for (const l of leads) {
      const acc = byStage.get(l.stage_id ?? "sem-etapa");
      if (acc) acc.periodo += 1;
    }

    const tagRows = countByTag(leads, tags)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Classificação do lead scoring (formulários)
    const classes = { hot: { n: 0, won: 0 }, warm: { n: 0, won: 0 }, cold: { n: 0, won: 0 }, nutrition: { n: 0, won: 0 } };
    for (const l of leads) {
      const tone = leadScoreTone(l.lead_classification);
      if (tone === "neutral") continue;
      classes[tone].n += 1;
      if (isWon(l.stage_id)) classes[tone].won += 1;
    }
    const classified = classes.hot.n + classes.warm.n + classes.cold.n + classes.nutrition.n;

    // Origem
    const sources = new Map<string, { n: number; won: number }>();
    for (const l of leads) {
      const key = l.source?.trim() || "Sem origem";
      const acc = sources.get(key) ?? { n: 0, won: 0 };
      acc.n += 1;
      if (isWon(l.stage_id)) acc.won += 1;
      sources.set(key, acc);
    }
    const sourceRows = [...sources.entries()]
      .map(([name, v]) => ({ name, ...v, conv: pct1(v.won, v.n) }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
    const bestSource = sourceRows.filter((s) => s.n >= 5 && s.won > 0).sort((a, b) => b.conv - a.conv)[0]?.name;

    return {
      stages, m, prev, conv, prevConv, closed, prevClosed, open, openValue, total: allLeads.length,
      weeks, last4, prev4, byStage, tagRows, hasTags: tags.length > 0, classes, classified, sourceRows, bestSource,
    };
  }, [data, from, to, prevRange.from, prevRange.to]);

  const choosePreset = (p: Preset) => {
    if (p === "custom") return;
    setPreset(p);
    setRange(presetRange(p));
  };

  const header = (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="truncate text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {activeOrganization?.name ?? "Comercial"}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {brLong(from)} a {brLong(to)} · comparado aos {prevRange.days} dias anteriores
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {pipelines.length > 1 && (
          <Select value={current?.id ?? ""} onValueChange={setPipelineId}>
            <SelectTrigger className="h-10 w-full rounded-xl bg-card sm:w-[220px]" aria-label="Pipeline">
              <SelectValue placeholder="Pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div role="group" aria-label="Período" className="flex gap-1 rounded-xl bg-muted p-1">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={preset === d}
              onClick={() => choosePreset(d)}
              className={cn(
                "h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold text-muted-foreground transition-colors sm:flex-none",
                preset === d && "bg-card text-foreground shadow-sm",
              )}
            >
              {d} dias
            </button>
          ))}
          <Popover open={customOpen} onOpenChange={(o) => { setCustomOpen(o); if (o) setDraft(range); }}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-pressed={preset === "custom"}
                aria-label="Período personalizado"
                className={cn(
                  "flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold text-muted-foreground transition-colors",
                  preset === "custom" && "bg-card text-foreground shadow-sm",
                )}
              >
                <CalendarRange className="h-4 w-4" />
                <span className="hidden sm:inline">Personalizado</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={draft.from} max={draft.to} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!draft.from || !draft.to || draft.from > draft.to}
                onClick={() => { setRange(draft); setPreset("custom"); setCustomOpen(false); }}
              >
                Aplicar
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );

  if (isLoading || wsLoading) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Panel className="items-center py-10 text-center">
          <h2 className="text-lg font-bold">Nenhum pipeline ainda</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Crie um pipeline com suas etapas para acompanhar conversão, resultados e crescimento aqui.
          </p>
          <Button asChild className="mt-2"><Link to="/pipeline">Abrir pipeline</Link></Button>
        </Panel>
      </div>
    );
  }

  const x = metrics;
  const growth = x.prev4 > 0 ? Math.round(((x.last4 - x.prev4) / x.prev4) * 100) : null;
  const funnel = [
    { label: "Leads", value: x.m.leads },
    { label: "Conectados", value: x.m.conectados },
    { label: "Reunião agendada", value: x.m.agendadas },
    { label: "Reunião realizada", value: x.m.realizadas },
    { label: "Proposta enviada", value: x.m.cof },
    { label: "Ganhos", value: x.m.ganhos },
  ];
  const kanbanStages = x.stages.map((s) => ({
    ...s,
    kind: classifyStage(s),
    agg: x.byStage.get(s.id) ?? { count: 0, total: 0, periodo: 0 },
  }));
  const kanbanTotal = kanbanStages.reduce((acc, s) => acc + s.agg.count, 0);
  const classRows = [
    { key: "hot" as const, label: "Quente", box: "bg-score-hot/10", text: "text-score-hot", bar: "bg-score-hot" },
    { key: "warm" as const, label: "Morno", box: "bg-score-warm/10", text: "text-score-warm", bar: "bg-score-warm" },
    { key: "cold" as const, label: "Frio", box: "bg-score-cold/10", text: "text-score-cold", bar: "bg-score-cold" },
    { key: "nutrition" as const, label: "Nutrição", box: "bg-score-nutrition/10", text: "text-score-nutrition", bar: "bg-score-nutrition" },
  ].filter((r) => r.key !== "nutrition" || x.classes.nutrition.n > 0);
  const hotRate = pct1(x.classes.hot.won, x.classes.hot.n);
  const coldRate = pct1(x.classes.cold.won, x.classes.cold.n);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {header}

      {/* Indicadores principais */}
      <section aria-label="Indicadores principais" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi
          label="Leads novos"
          value={String(x.m.leads)}
          delta={changeBadge(x.m.leads, x.prev.leads)}
          hint={`vs. ${x.prev.leads} no período anterior`}
          spark={x.weeks.map((w) => w.leads)}
        />
        <Kpi
          label="Taxa de conversão"
          value={fmtPct(x.conv)}
          delta={ppBadge(x.conv, x.prevConv, x.m.leads + x.prev.leads > 0)}
          hint="ganhos ÷ leads do período"
          spark={x.weeks.map((w) => (w.leads ? w.ganhos / w.leads : 0))}
        />
        <Kpi
          label="Negócios ganhos"
          value={String(x.closed.count)}
          extra={x.closed.value > 0 ? money(x.closed.value) : undefined}
          delta={changeBadge(x.closed.count, x.prevClosed.count)}
          hint={`vs. ${x.prevClosed.count} no período anterior`}
          spark={x.weeks.map((w) => w.ganhos)}
        />
        <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-transparent bg-[var(--brand-dark)] p-4 text-white dark:border-primary/25 dark:bg-[var(--brand-deep)] sm:gap-2.5 sm:p-5">
          <p className="text-xs font-semibold text-white/70 sm:text-[13px]">Em negociação</p>
          <p className="truncate text-[22px] font-extrabold tracking-tight tabular-nums sm:text-[32px]">{money(x.openValue)}</p>
          <p className="text-xs sm:text-[13px]">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 font-bold text-[var(--brand-green)]">{x.open.length} leads</span>
            <span className="ml-1.5 hidden text-white/70 sm:inline">em etapas abertas</span>
          </p>
        </div>
      </section>

      {/* Evolução + funil */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold sm:text-[17px]">Evolução</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {growth === null ? (
                  <>Leads novos e ganhos por semana · últimas 12 semanas</>
                ) : (
                  <>
                    Últimas 4 semanas: <strong className="text-foreground">{x.last4} leads</strong>,{" "}
                    <strong className={growth >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}>
                      {growth >= 0 ? "+" : ""}{growth}%
                    </strong>{" "}
                    vs. as 4 anteriores
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-4 text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-primary/40" />Leads novos</span>
              <span className="flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded bg-foreground" />Ganhos</span>
            </div>
          </div>
          <div className="mt-3 h-[200px] sm:h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={x.weeks} margin={{ top: 8, right: 0, left: -22, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis yAxisId="g" orientation="right" hide allowDecimals={false} domain={[0, (max: number) => Math.max(4, Math.ceil(max * 1.3))]} />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)" }}
                  labelFormatter={(_, p) => (p?.[0]?.payload?.periodo as string) ?? ""}
                  formatter={(v: number, name: string) => [v, name === "leads" ? "Leads novos" : "Ganhos"]}
                />
                <Bar yAxisId="l" dataKey="leads" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {x.weeks.map((_, i) => (
                    <Cell key={i} fill="var(--primary)" fillOpacity={i === 11 ? 1 : 0.38} />
                  ))}
                </Bar>
                <Line yAxisId="g" dataKey="ganhos" type="monotone" stroke="var(--foreground)" strokeWidth={2.25} dot={{ r: 3, fill: "var(--foreground)" }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold sm:text-[17px]">Funil de conversão</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Leads do período em cada etapa</p>
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-2.5">
            {funnel.map((f, i) => {
              return (
                <div key={f.label}>
                  <div className="flex items-baseline justify-between gap-3 text-[13px] font-semibold">
                    <span className="truncate">{f.label}</span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      {i > 0 && (
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          {x.m.leads > 0 ? `${Math.round((f.value / x.m.leads) * 100)}%` : "—"}
                        </span>
                      )}
                      {f.value}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{
                        width: `${x.m.leads ? Math.max(f.value ? 2 : 0, (f.value / x.m.leads) * 100) : 0}%`,
                        opacity: 0.45 + (i / (funnel.length - 1)) * 0.55,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-auto flex justify-between border-t pt-3 text-[13px]">
            <span className="text-muted-foreground">Conversão total · % sobre os leads do período</span>
            <strong>{fmtPct(x.conv)}</strong>
          </div>
        </Panel>
      </section>

      {/* Kanban agora */}
      <Panel className="gap-4 pr-0 sm:pr-0">
        <div className="flex flex-wrap items-end justify-between gap-3 pr-4 sm:pr-5">
          <div>
            <h2 className="text-base font-extrabold sm:text-[17px]">Kanban agora</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {x.total} leads no pipeline · {x.open.length} em aberto · {money(x.openValue)} em negociação
            </p>
          </div>
          <Link to="/pipeline" className="flex items-center gap-1 text-[13px] font-bold text-emerald-700 hover:underline dark:text-emerald-400">
            Abrir pipeline <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {kanbanStages.length === 0 ? (
          <p className="pr-4 text-sm text-muted-foreground">Nenhuma etapa configurada.</p>
        ) : (
          <>
            {kanbanTotal > 0 && (
              <div aria-hidden className="mr-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full sm:mr-5 sm:h-3">
                {kanbanStages.filter((s) => s.agg.count > 0).map((s) => (
                  <div key={s.id} style={{ flex: s.agg.count, backgroundColor: s.color }} />
                ))}
              </div>
            )}
            <div className="flex snap-x gap-2.5 overflow-x-auto pb-1 pr-4 [scrollbar-width:none] sm:pr-5 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(140px,1fr))] lg:overflow-visible">
              {kanbanStages.map((s) => {
                const final = s.kind === "ganho" || s.kind === "perdido" || s.kind === "nutricao";
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "w-[132px] shrink-0 snap-start rounded-xl border border-t-4 p-3 lg:w-auto",
                      s.kind === "ganho" && "bg-primary/5",
                      (s.kind === "perdido" || s.kind === "nutricao") && "bg-muted/50",
                    )}
                    style={{ borderTopColor: s.color }}
                  >
                    <p className="truncate text-xs font-bold text-muted-foreground" title={s.name}>{s.name}</p>
                    <p className={cn(
                      "mt-1 text-2xl font-extrabold tabular-nums sm:text-[26px]",
                      s.kind === "ganho" && "text-emerald-700 dark:text-emerald-400",
                      s.kind === "perdido" && "text-muted-foreground",
                    )}>
                      {s.agg.count}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.kind === "perdido" && x.total
                        ? `${Math.round((s.agg.count / x.total) * 100)}% dos leads`
                        : money(s.agg.total)}
                    </p>
                    <p className={cn(
                      "mt-1.5 text-xs font-bold",
                      final ? "font-semibold text-muted-foreground" : "text-emerald-700 dark:text-emerald-400",
                    )}>
                      {final ? "etapa final" : s.agg.periodo ? `+${s.agg.periodo} no período` : "— no período"}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Panel>

      {/* Tags, classificação e origem */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel>
          <div>
            <h2 className="text-base font-extrabold sm:text-[17px]">Por tag</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">% dos {x.m.leads} leads do período</p>
          </div>
          {!x.hasTags ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma tag configurada. Configure em Pipeline → Configurações → Tags de conversão.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {x.tagRows.map((t) => {
                const p = x.m.leads ? Math.round((t.count / x.m.leads) * 100) : 0;
                return (
                  <div key={t.slug} className="text-[13px]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 font-semibold">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="truncate">{t.name}</span>
                      </span>
                      <span className="shrink-0 font-bold tabular-nums">
                        {t.count} <span className="font-medium text-muted-foreground">· {p}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full" style={{ width: `${p}%`, backgroundColor: t.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel>
          <div>
            <h2 className="text-base font-extrabold sm:text-[17px]">Classificação dos leads</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Lead scoring dos formulários · {x.classified} classificados</p>
          </div>
          {x.classified === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aparece quando os leads chegam por formulários com lead scoring.{" "}
              <Link to="/formularios" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Ver formulários</Link>
            </p>
          ) : (
            <>
              <div aria-hidden className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                {classRows.filter((r) => x.classes[r.key].n > 0).map((r) => (
                  <div key={r.key} className={r.bar} style={{ flex: x.classes[r.key].n }} />
                ))}
              </div>
              <div className={cn("grid gap-2", classRows.length === 4 ? "grid-cols-2 sm:grid-cols-4 md:grid-cols-2" : "grid-cols-3")}>
                {classRows.map((r) => {
                  const c = x.classes[r.key];
                  return (
                    <div key={r.key} className={cn("min-w-0 rounded-xl p-3", r.box)}>
                      <p className={cn("text-xs font-bold", r.text)}>{r.label}</p>
                      <p className="mt-0.5 text-2xl font-extrabold tabular-nums">{c.n}</p>
                      <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
                        {c.won} ganhos · {c.n ? Math.round((c.won / c.n) * 100) : 0}%
                      </p>
                    </div>
                  );
                })}
              </div>
              {hotRate > 0 && (
                <p className="text-[13px] text-muted-foreground">
                  {coldRate > 0 ? (
                    <>Leads <strong className="text-foreground">quentes</strong> convertem{" "}
                      <strong className="text-foreground">{Math.round(hotRate / coldRate)}×</strong> mais que os frios.</>
                  ) : (
                    <><strong className="text-foreground">{Math.round(hotRate)}%</strong> dos leads quentes viraram negócio.</>
                  )}
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel className="md:col-span-2 xl:col-span-1">
          <div>
            <h2 className="text-base font-extrabold sm:text-[17px]">Origem dos leads</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Leads novos e conversão por canal</p>
          </div>
          {x.sourceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem leads no período.</p>
          ) : (
            <div className="flex flex-col text-[13px]">
              <div className="grid grid-cols-[minmax(0,1fr)_56px_64px] gap-2 border-b pb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <span>Canal</span><span className="text-right">Leads</span><span className="text-right">Conv.</span>
              </div>
              {x.sourceRows.map((s, i) => (
                <div
                  key={s.name}
                  className={cn("grid grid-cols-[minmax(0,1fr)_56px_64px] gap-2 py-2", i < x.sourceRows.length - 1 && "border-b border-border/60")}
                >
                  <span className="truncate font-semibold">{s.name}</span>
                  <span className="text-right tabular-nums">{s.n}</span>
                  <span className={cn("text-right tabular-nums", s.name === x.bestSource && "font-bold text-emerald-700 dark:text-emerald-400")}>
                    {fmtPct(s.conv)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3.5 rounded-2xl border bg-card p-4 text-card-foreground sm:p-5", className)}>
      {children}
    </div>
  );
}

type DeltaBadge = { text: string; tone: "up" | "down" | "flat" } | null;

function changeBadge(cur: number, prev: number): DeltaBadge {
  if (!cur && !prev) return null;
  if (!prev) return { text: "novo", tone: "up" };
  const d = Math.round(((cur - prev) / prev) * 100);
  if (d === 0) return { text: "0%", tone: "flat" };
  return { text: `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}%`, tone: d > 0 ? "up" : "down" };
}

function ppBadge(cur: number, prev: number, show: boolean): DeltaBadge {
  if (!show) return null;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return { text: "0 p.p.", tone: "flat" };
  return {
    text: `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toLocaleString("pt-BR")} p.p.`,
    tone: d > 0 ? "up" : "down",
  };
}

function Kpi({
  label, value, extra, delta, hint, spark,
}: { label: string; value: string; extra?: string; delta: DeltaBadge; hint: string; spark: number[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl border bg-card p-4 text-card-foreground sm:gap-2.5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground sm:text-[13px]">{label}</p>
        <Sparkline values={spark} className="hidden sm:block" />
      </div>
      <p className="truncate text-[26px] font-extrabold tracking-tight tabular-nums sm:text-[32px]">
        {value}
        {extra && <span className="ml-1.5 text-sm font-bold text-muted-foreground sm:text-lg">· {extra}</span>}
      </p>
      <div className="flex min-w-0 items-center gap-2 text-xs sm:text-[13px]">
        {delta && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 font-bold",
              delta.tone === "up" && "bg-primary/15 text-emerald-700 dark:text-emerald-300",
              delta.tone === "down" && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
              delta.tone === "flat" && "bg-muted text-muted-foreground",
            )}
          >
            {delta.text}
          </span>
        )}
        <span className="hidden truncate text-muted-foreground sm:inline">{hint}</span>
      </div>
    </div>
  );
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 96;
  const h = 30;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  if (max === min) return null;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / (max - min)) * (h - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className={cn("shrink-0", className)}>
      <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
