import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { pipelineDashboard } from "@/lib/pipeline/dashboard.functions";
import { currency } from "@/components/pipeline/LeadCard";

export const Route = createFileRoute("/_authenticated/comercial/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard Comercial — Hublynx Core" },
      { name: "description", content: "Acompanhe leads por etapa do kanban, entradas por período e valor em negociação." },
      { property: "og:title", content: "Dashboard Comercial — Hublynx Core" },
      { property: "og:description", content: "Leads por etapa, entradas por período e valor em negociação." },
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

  const { data, isLoading } = useQuery({
    queryKey: ["comercial-dashboard", pipelineId ?? "default", from, to],
    queryFn: () => dashFn({ data: { pipelineId, from, to } }),
    staleTime: 30_000,
  });

  const pipelines = data?.pipelines ?? [];
  const current = data?.pipeline ?? null;
  const stages = data?.stages ?? [];
  const leads = data?.leads ?? [];

  const byStage = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const l of leads) {
      const key = l.stage_id ?? "sem-etapa";
      const acc = map.get(key) ?? { count: 0, total: 0 };
      acc.count += 1;
      acc.total += Number(l.value ?? 0);
      map.set(key, acc);
    }
    return map;
  }, [leads]);

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
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [leads]);

  const total = leads.length;
  const valueTotal = leads.reduce((s, l) => s + Number(l.value ?? 0), 0);
  const won = stages.filter((s) => s.is_won).map((s) => s.id);
  const lost = stages.filter((s) => s.is_lost).map((s) => s.id);
  const wonCount = leads.filter((l) => l.stage_id && won.includes(l.stage_id)).length;
  const lostCount = leads.filter((l) => l.stage_id && lost.includes(l.stage_id)).length;
  const conv = total ? Math.round((wonCount / total) * 100) : 0;
  const maxDay = Math.max(1, ...byDay.map(([, v]) => v));
  const maxStage = Math.max(1, ...stages.map((s) => byStage.get(s.id)?.count ?? 0));

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
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Leads de entrada" value={String(total)} hint="criados no período" />
            <Kpi label="Em negociação" value={currency(valueTotal)} hint="soma dos valores" />
            <Kpi label="Ganhos" value={`${wonCount}`} hint={`${conv}% de conversão`} tone="text-emerald-600" />
            <Kpi label="Perdidos" value={`${lostCount}`} hint="etapas de perda" tone="text-rose-600" />
          </div>

          <section className="rounded-xl border p-4">
            <h2 className="mb-3 text-sm font-semibold">Estado atual no kanban</h2>
            <div className="space-y-2.5">
              {stages.map((s) => {
                const agg = byStage.get(s.id) ?? { count: 0, total: 0 };
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-sm">{s.name}</span>
                    <div className="h-2.5 flex-1 rounded-full bg-muted">
                      <div
                        className="h-2.5 rounded-full"
                        style={{ width: `${(agg.count / maxStage) * 100}%`, backgroundColor: s.color }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-sm tabular-nums">{agg.count}</span>
                    <span className="w-28 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {agg.total ? currency(agg.total) : "·"}
                    </span>
                  </div>
                );
              })}
              {stages.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma etapa configurada.</p>}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border p-4">
              <h2 className="mb-3 text-sm font-semibold">Entradas por dia</h2>
              {byDay.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem leads no período.</p>
              ) : (
                <div className="flex h-40 items-end gap-1 overflow-x-auto">
                  {byDay.map(([d, v]) => (
                    <div key={d} className="flex min-w-[10px] flex-1 flex-col items-center gap-1" title={`${brDate(d)}: ${v}`}>
                      <div className="w-full rounded-t bg-primary" style={{ height: `${(v / maxDay) * 120}px` }} />
                      <span className="text-[9px] text-muted-foreground">{d.slice(8, 10)}</span>
                    </div>
                  ))}
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

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-[22px] tabular-nums ${tone ?? ""}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
