import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { pipelineDashboard } from "@/lib/pipeline/dashboard.functions";
import { useWorkspace } from "@/hooks/useWorkspace";
import { computeFunnel, classifyStage, countByTag, type FunnelMode } from "@/lib/pipeline/funnel";
import { currency } from "@/components/pipeline/LeadCard";

export const Route = createFileRoute("/_authenticated/comercial/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard Comercial — Hublynx Core" },
      { name: "description", content: "KPIs do funil: leads, conectados, reuniões agendadas e realizadas, no show, COF e taxa de conversão." },
      { property: "og:title", content: "Dashboard Comercial — Hublynx Core" },
      { property: "og:description", content: "Funil comercial com comparativo de período e gráficos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComercialDashboard,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const brDate = (s: string) => s.split("-").reverse().join("/");

function ComercialDashboard() {
  const dashFn = useServerFn(pipelineDashboard);
  const today = new Date();
  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(iso(today));
  const [mode, setMode] = useState<FunnelMode>("both");

  const { activeWorkspaceId, isLoading: wsLoading } = useWorkspace();
  const { data, isLoading } = useQuery({
    queryKey: ["comercial-dashboard", pipelineId ?? "default", from, to, activeWorkspaceId ?? "none"],
    queryFn: () =>
      dashFn({
        data: { pipelineId, from, to, ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}) },
      }),
    staleTime: 30_000,
    enabled: !wsLoading,
  });

  const pipelines = data?.pipelines ?? [];
  const current = data?.pipeline ?? null;
  const stages = useMemo(() => data?.stages ?? [], [data]);
  const leads = useMemo(() => data?.leads ?? [], [data]);
  const previousLeads = useMemo(() => data?.previousLeads ?? [], [data]);
  const allLeads = useMemo(() => data?.allLeads ?? [], [data]);

  const tags = useMemo(() => (data?.tags ?? []).filter((t) => t.active !== false), [data]);
  const opts = useMemo(() => ({ tags, mode }), [tags, mode]);

  const m = useMemo(() => computeFunnel(stages, leads, opts), [stages, leads, opts]);
  const prev = useMemo(() => computeFunnel(stages, previousLeads, opts), [stages, previousLeads, opts]);
  const total = useMemo(() => computeFunnel(stages, allLeads, opts), [stages, allLeads, opts]);
  const tagCounts = useMemo(() => countByTag(leads, tags), [leads, tags]);

  const emAberto = total.leads - total.ganhos - total.perdidos - total.nutricao;
  const valorAberto = useMemo(() => {
    const closed = new Set(
      stages
        .filter((s) => ["ganho", "perdido", "nutricao"].includes(classifyStage(s)))
        .map((s) => s.id),
    );
    return allLeads.reduce(
      (acc, l) => (l.stage_id && closed.has(l.stage_id) ? acc : acc + Number(l.value ?? 0)),
      0,
    );
  }, [allLeads, stages]);

  const byStage = useMemo(() => {
    const map = new Map<string, { count: number; total: number; periodo: number }>();
    for (const l of allLeads) {
      const key = l.stage_id ?? "sem-etapa";
      const acc = map.get(key) ?? { count: 0, total: 0, periodo: 0 };
      acc.count += 1;
      acc.total += Number(l.value ?? 0);
      map.set(key, acc);
    }
    for (const l of leads) {
      const key = l.stage_id ?? "sem-etapa";
      const acc = map.get(key) ?? { count: 0, total: 0, periodo: 0 };
      acc.periodo += 1;
      map.set(key, acc);
    }
    return map;
  }, [allLeads, leads]);

  const bySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) map.set(l.source || "Sem origem", (map.get(l.source || "Sem origem") ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [leads]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const d = l.created_at.slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) => ({ dia: d.slice(8, 10) + "/" + d.slice(5, 7), leads: v }));
  }, [leads]);

  const comparativo = useMemo(
    () => [
      { nome: "Leads", atual: m.leads, anterior: prev.leads },
      { nome: "Conectados", atual: m.conectados, anterior: prev.conectados },
      { nome: "Reun. agend.", atual: m.agendadas, anterior: prev.agendadas },
      { nome: "Reun. realiz.", atual: m.realizadas, anterior: prev.realizadas },
      { nome: "No show", atual: m.noshow, anterior: prev.noshow },
      { nome: "COF", atual: m.cof, anterior: prev.cof },
      { nome: "Ganhos", atual: m.ganhos, anterior: prev.ganhos },
      { nome: "Perdidos", atual: m.perdidos, anterior: prev.perdidos },
    ],
    [m, prev],
  );

  const funil = useMemo(
    () => [
      { etapa: "Leads", qtd: m.leads },
      { etapa: "Conectados", qtd: m.conectados },
      { etapa: "Agendadas", qtd: m.agendadas },
      { etapa: "Realizadas", qtd: m.realizadas },
      { etapa: "COF", qtd: m.cof },
      { etapa: "Ganhos", qtd: m.ganhos },
    ],
    [m],
  );

  

  const preset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    setFrom(iso(start));
    setTo(iso(end));
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Comercial</h1>
          <p className="text-sm text-muted-foreground">
            {current?.name ?? "—"} · {brDate(from)} a {brDate(to)}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Pipeline</Label>
            <Select value={current?.id ?? ""} onValueChange={setPipelineId}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Pipeline" /></SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => preset(7)}>7d</Button>
            <Button variant="outline" size="sm" onClick={() => preset(30)}>30d</Button>
            <Button variant="outline" size="sm" onClick={() => preset(90)}>90d</Button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <>
          <section
            className="rounded-xl border p-4 text-white"
            style={{ background: "linear-gradient(135deg, var(--brand-dark) 0%, var(--brand-blue) 100%)" }}
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">Leads no pipeline (total, sem filtro de data)</h2>
              <span className="text-xs text-white/70">{current?.name ?? "—"}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Total label="Total no pipeline" value={total.leads} variant="gradient" />
              <Total label="Em aberto" value={emAberto} variant="gradient" />
              <Total label="Em nutrição" value={total.nutricao} variant="gradient" />
              <Total label="Ganhos" value={total.ganhos} tone="text-emerald-400" variant="gradient" />
              <Total label="Perdidos" value={total.perdidos} tone="text-rose-400" variant="gradient" />
              <Total label="Valor em aberto" value={valorAberto} money variant="gradient" />
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

            <Kpi label="Leads" value={m.leads} prev={prev.leads} hint="entradas no período" />
            <Kpi label="Conectados" value={m.conectados} prev={prev.conectados} hint={`${m.taxaConexao}% dos leads`} />
            <Kpi label="Reuniões agendadas" value={m.agendadas} prev={prev.agendadas} />
            <Kpi label="Reuniões realizadas" value={m.realizadas} prev={prev.realizadas} hint={`${m.taxaReuniao}% dos leads`} />
            <Kpi label="No show" value={m.noshow} prev={prev.noshow} hint={`${m.taxaNoShow}% das agendadas`} tone="text-rose-600" invert />
            <Kpi label="COF enviadas" value={m.cof} prev={prev.cof} hint={`${m.taxaCof}% das reuniões`} />
            <Kpi label="Ganhos" value={m.ganhos} prev={prev.ganhos} hint={`${m.taxaConversao}% de conversão`} tone="text-emerald-600" />
            <Kpi label="Perdidos" value={m.perdidos} prev={prev.perdidos} tone="text-rose-600" invert />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Rate label="% Leads x Conectados" value={m.taxaConexao} prev={prev.taxaConexao} />
            <Rate label="% Leads x Reuniões feitas" value={m.taxaReuniao} prev={prev.taxaReuniao} />
            <Rate label="% Reuniões x COF" value={m.taxaCof} prev={prev.taxaCof} />
            <Rate label="% Taxa de conversão" value={m.taxaConversao} prev={prev.taxaConversao} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border p-4">
              <h2 className="mb-1 text-sm font-semibold">Comparativo com período anterior</h2>
              <p className="mb-3 text-xs text-muted-foreground">Mesmo número de dias imediatamente anteriores.</p>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparativo} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={54} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="anterior" name="Período anterior" fill="var(--muted-foreground)" opacity={0.4} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="atual" name="Período atual" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-xl border p-4">
              <h2 className="mb-1 text-sm font-semibold">Funil comercial</h2>
              <p className="mb-3 text-xs text-muted-foreground">Leads que alcançaram cada etapa.</p>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funil} layout="vertical" margin={{ top: 4, right: 16, left: 16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="etapa" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="qtd" name="Leads" radius={[0, 4, 4, 0]}>
                      {funil.map((_, i) => (
                        <Cell key={i} fill="var(--primary)" opacity={1 - i * 0.13} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <section
            className="rounded-xl border p-4 text-white"
            style={{ background: "linear-gradient(135deg, var(--brand-dark) 0%, var(--brand-blue) 100%)" }}
          >
            <h2 className="mb-1 text-sm font-semibold text-white">Estado atual no kanban</h2>
            <p className="mb-4 text-xs text-white/70">
              Quantidade total de leads em cada etapa · em destaque, os que entraram no período.
            </p>

            {stages.length === 0 ? (
              <p className="text-sm text-white/70">Nenhuma etapa configurada.</p>
            ) : (
              <div className="-mx-1 overflow-x-auto pb-2">
                <div className="flex min-w-max gap-3 px-1">
                  {stages.map((s) => {
                    const agg = byStage.get(s.id) ?? { count: 0, total: 0, periodo: 0 };
                    const kind = classifyStage(s);
                    return (
                      <div key={s.id} className="flex w-[168px] shrink-0 flex-col">
                        <p className="truncate text-center text-[11px] font-bold uppercase tracking-wide text-white" title={s.name}>
                          {s.name}
                        </p>
                        <p className="mt-0.5 text-center text-[11px] text-white/70">
                          {agg.count} leads, {currency(agg.total)}
                        </p>
                        <div className="mt-2 h-[3px] rounded-full" style={{ backgroundColor: s.color }} />

                        <div className="mt-3 flex flex-col items-center justify-center rounded-2xl border border-white/25 bg-white/10 py-6 backdrop-blur-sm">
                          <span className="font-mono text-[42px] font-light leading-none tabular-nums text-white">
                            {agg.count || "0"}
                          </span>
                          <span className="mt-1 font-mono text-sm font-semibold tabular-nums text-white/90">
                            {currency(agg.total)}
                          </span>
                        </div>

                        <div className="mt-3 h-[3px] rounded-full bg-white/60" />
                        <p className="mt-1 text-center text-[11px] text-white/70">
                          {agg.periodo ? `+${agg.periodo} no período` : "· no período"}
                        </p>
                        {kind !== "entrada" && (
                          <p className="mt-0.5 text-center text-[10px] uppercase tracking-wide text-white/50">{kind}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>


          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border p-4">
              <h2 className="mb-3 text-sm font-semibold">Entradas por dia</h2>
              {byDay.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem leads no período.</p>
              ) : (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={byDay} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="dia" tick={{ fontSize: 10 }} minTickGap={12} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Line type="monotone" dataKey="leads" stroke="var(--primary)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="rounded-xl border p-4">
              <h2 className="mb-3 text-sm font-semibold">Origem dos leads</h2>
              {bySource.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados no período.</p>
              ) : (
                <ul className="space-y-2">
                  {bySource.map(([src, n]) => (
                    <li key={src} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-muted-foreground">{src}</span>
                      <span className="font-mono tabular-nums">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Delta({ value, prev, invert }: { value: number; prev: number; invert?: boolean }) {
  const diff = value - prev;
  if (!prev && !value) return null;
  const good = invert ? diff < 0 : diff > 0;
  const Icon = diff === 0 ? Minus : diff > 0 ? ArrowUp : ArrowDown;
  const tone = diff === 0 ? "text-muted-foreground" : good ? "text-emerald-600" : "text-rose-600";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${tone}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(diff)}
    </span>
  );
}

function Total({
  label, value, tone, money, variant,
}: { label: string; value: number; tone?: string; money?: boolean; variant?: "default" | "gradient" }) {
  const isGradient = variant === "gradient";
  return (
    <div className={`rounded-lg border p-3 ${isGradient ? "bg-white/10 backdrop-blur-sm" : "bg-background"}`}>
      <p className={`text-[11px] font-medium uppercase tracking-wide ${isGradient ? "text-white/80" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p className={`mt-1 font-mono text-[22px] leading-none tabular-nums ${tone ?? (isGradient ? "text-white" : "")}`}>
        {value ? (money ? currency(value) : value) : "·"}
      </p>
    </div>
  );
}


function Kpi({
  label, value, prev, hint, tone, invert,
}: { label: string; value: number; prev: number; hint?: string; tone?: string; invert?: boolean }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={`font-mono text-[26px] leading-none tabular-nums ${tone ?? ""}`}>{value || "·"}</p>
        <Delta value={value} prev={prev} invert={invert} />
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Rate({ label, value, prev }: { label: string; value: number; prev: number }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="font-mono text-[26px] leading-none tabular-nums">{value}%</p>
        <Delta value={value} prev={prev} />
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}
