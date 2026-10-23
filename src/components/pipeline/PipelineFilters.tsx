import { useMemo, useState } from "react";
import { CalendarRange, Filter, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  activeFilterCount, EMPTY_BOARD_FILTERS, type BoardFilters, type OriginKind, type OriginOption,
  type PeriodPreset, type TaskFilter, type Temperature,
} from "@/lib/pipeline/board-filters";
import { cn } from "@/lib/utils";

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  todos: "A qualquer hora", hoje: "Hoje", ontem: "Ontem", "7": "Últimos 7 dias", "30": "Últimos 30 dias",
  "90": "Últimos 90 dias", mes: "Este mês", custom: "Personalizado",
};
export const TASK_LABEL: Record<TaskFilter, string> = {
  agendadas: "Com tarefas agendadas", hoje: "Com tarefa para hoje", atrasadas: "Com tarefas atrasadas", sem: "Sem tarefas",
};
export const TEMP_LABEL: Record<Temperature, string> = { quente: "Quente", morno: "Morno", frio: "Frio" };
const TEMP_TONE: Record<Temperature, string> = {
  quente: "data-[on=true]:border-score-hot data-[on=true]:bg-score-hot/10 data-[on=true]:text-score-hot",
  morno: "data-[on=true]:border-score-warm data-[on=true]:bg-score-warm/10 data-[on=true]:text-score-warm",
  frio: "data-[on=true]:border-score-cold data-[on=true]:bg-score-cold/10 data-[on=true]:text-score-cold",
};
export const KIND_LABEL: Record<OriginKind, string> = {
  source: "Fonte", utm_source: "utm_source", utm_medium: "utm_medium", utm_campaign: "utm_campaign", anuncio: "Anúncio",
};

type Stage = { id: string; name: string; color: string };
export type TagOption = { slug: string; name: string; color?: string; count: number };

const SHORTCUTS: { label: string; dot?: string; f: Partial<BoardFilters> }[] = [
  { label: "Todos os leads", f: {} },
  { label: "Entraram hoje", f: { period: "hoje" } },
  { label: "Com tarefas agendadas", dot: "bg-sky-500", f: { tasks: ["agendadas"] } },
  { label: "Leads sem tarefas", dot: "bg-amber-400", f: { tasks: ["sem"] } },
  { label: "Com tarefas atrasadas", dot: "bg-rose-500", f: { tasks: ["atrasadas"] } },
  { label: "Leads quentes", dot: "bg-score-hot", f: { temperatures: ["quente"] } },
];

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function PipelineFilters({
  value, onChange, stages, origins, tags, resultCount,
}: {
  value: BoardFilters;
  onChange: (f: BoardFilters) => void;
  stages: Stage[];
  origins: OriginOption[];
  tags: TagOption[];
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [tagQ, setTagQ] = useState("");
  const [originQ, setOriginQ] = useState("");
  const n = activeFilterCount(value);
  const set = <K extends keyof BoardFilters>(k: K, v: BoardFilters[K]) => onChange({ ...value, [k]: v });

  const tagList = useMemo(() => {
    const q = tagQ.trim().toLowerCase();
    return tags.filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [tags, tagQ]);
  const originGroups = useMemo(() => {
    const q = originQ.trim().toLowerCase();
    const list = origins.filter((o) => !q || o.label.toLowerCase().includes(q));
    return (Object.keys(KIND_LABEL) as OriginKind[])
      .map((kind) => ({ kind, items: list.filter((o) => o.kind === kind).slice(0, 30) }))
      .filter((g) => g.items.length);
  }, [origins, originQ]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={n ? "default" : "outline"} size="sm" className="h-9 shrink-0 sm:h-8" aria-label="Filtros">
          <Filter className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Filtros</span>
          {n > 0 && <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-[11px] font-bold tabular-nums">{n}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(980px,calc(100vw-1.5rem))] p-0">
        <div className="grid max-h-[min(78vh,720px)] grid-cols-1 overflow-y-auto md:grid-cols-[220px_minmax(0,1fr)_minmax(0,300px)] md:overflow-hidden">
          {/* Atalhos */}
          <nav aria-label="Atalhos de filtro" className="border-b p-2 md:border-b-0 md:border-r md:overflow-y-auto">
            {SHORTCUTS.map((s) => {
              const applied = JSON.stringify({ ...EMPTY_BOARD_FILTERS, ...s.f }) === JSON.stringify(value);
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => onChange({ ...EMPTY_BOARD_FILTERS, ...s.f })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted",
                    applied && "bg-primary/10 font-semibold text-primary",
                  )}
                >
                  {s.dot && <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.dot)} />}
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Propriedades */}
          <div className="space-y-5 p-4 md:overflow-y-auto">
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Data de entrada</h3>
              <Select value={value.period} onValueChange={(v) => set("period", v as PeriodPreset)}>
                <SelectTrigger aria-label="Período" className="justify-start gap-2 [&>span]:flex-1 [&>span]:text-left"><CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERIOD_LABEL) as PeriodPreset[]).map((p) => <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
              {value.period === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" aria-label="De" value={value.from} max={value.to || undefined} onChange={(e) => set("from", e.target.value)} />
                  <Input type="date" aria-label="Até" value={value.to} min={value.from || undefined} onChange={(e) => set("to", e.target.value)} />
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tarefas</h3>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {(Object.keys(TASK_LABEL) as TaskFilter[]).map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <Checkbox checked={value.tasks.includes(k)} onCheckedChange={() => set("tasks", toggle(value.tasks, k))} />
                    {TASK_LABEL[k]}
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Temperatura</h3>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TEMP_LABEL) as Temperature[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    data-on={value.temperatures.includes(t)}
                    aria-pressed={value.temperatures.includes(t)}
                    onClick={() => set("temperatures", toggle(value.temperatures, t))}
                    className={cn("rounded-full border px-3 py-1 text-sm font-medium transition-colors hover:bg-muted", TEMP_TONE[t])}
                  >
                    {TEMP_LABEL[t]}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Etapas</h3>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {stages.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <Checkbox checked={value.stageIds.includes(s.id)} onCheckedChange={() => set("stageIds", toggle(value.stageIds, s.id))} />
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="truncate">{s.name}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Origem do lead</h3>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={originQ} onChange={(e) => setOriginQ(e.target.value)} placeholder="Localizar fonte, UTM, campanha..." className="pl-8" />
              </div>
              {originGroups.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma origem encontrada.</p>}
              {originGroups.map((g) => (
                <div key={g.kind} className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground">{KIND_LABEL[g.kind]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((o) => {
                      const on = value.origins.includes(o.key);
                      return (
                        <button
                          key={o.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set("origins", toggle(value.origins, o.key))}
                          className={cn(
                            "flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[13px] hover:bg-muted",
                            on && "border-primary bg-primary/10 font-semibold text-primary",
                          )}
                        >
                          <span className="truncate">{o.label}</span>
                          <span className="text-muted-foreground tabular-nums">{o.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-2 border-t p-4 md:border-l md:border-t-0 md:overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tags</h3>
              <div role="group" aria-label="Combinar tags" className="flex rounded-md bg-muted p-0.5 text-[11px] font-semibold">
                {(["any", "all"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={value.tagMode === m} onClick={() => set("tagMode", m)}
                    className={cn("rounded px-2 py-1 text-muted-foreground", value.tagMode === m && "bg-card text-foreground shadow-sm")}>
                    {m === "any" ? "Qualquer" : "Todas"}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={tagQ} onChange={(e) => setTagQ(e.target.value)} placeholder="Localizar tags" className="pl-8" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tagList.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tag.</p>}
              {tagList.map((t) => {
                const on = value.tags.some((x) => x.toLowerCase() === t.slug.toLowerCase());
                return (
                  <button
                    key={t.slug}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("tags", on ? value.tags.filter((x) => x.toLowerCase() !== t.slug.toLowerCase()) : [...value.tags, t.slug])}
                    className={cn("flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[13px] hover:bg-muted", on && "border-primary bg-primary/10 font-semibold text-primary")}
                  >
                    {t.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />}
                    <span className="truncate">{t.name}</span>
                    <span className="text-muted-foreground tabular-nums">{t.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
          <span className="text-sm text-muted-foreground"><strong className="text-foreground tabular-nums">{resultCount}</strong> leads encontrados</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={!n} onClick={() => onChange(EMPTY_BOARD_FILTERS)}>Limpar filtros</Button>
            <Button size="sm" onClick={() => setOpen(false)}>Ver leads</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Filtros ativos como etiquetas removíveis, abaixo do cabeçalho. */
export function ActiveFilterChips({
  value, onChange, stages, origins, tags,
}: {
  value: BoardFilters;
  onChange: (f: BoardFilters) => void;
  stages: Stage[];
  origins: OriginOption[];
  tags: TagOption[];
}) {
  if (!activeFilterCount(value)) return null;
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (value.period !== "todos") {
    const label = value.period === "custom"
      ? `${value.from ? value.from.split("-").reverse().join("/") : "…"} a ${value.to ? value.to.split("-").reverse().join("/") : "…"}`
      : PERIOD_LABEL[value.period];
    chips.push({ key: "period", label: `Entrada: ${label}`, remove: () => onChange({ ...value, period: "todos", from: "", to: "" }) });
  }
  for (const t of value.tasks) chips.push({ key: `t-${t}`, label: TASK_LABEL[t], remove: () => onChange({ ...value, tasks: value.tasks.filter((x) => x !== t) }) });
  for (const t of value.temperatures) chips.push({ key: `te-${t}`, label: TEMP_LABEL[t], remove: () => onChange({ ...value, temperatures: value.temperatures.filter((x) => x !== t) }) });
  for (const id of value.stageIds) chips.push({ key: `s-${id}`, label: `Etapa: ${stages.find((s) => s.id === id)?.name ?? "—"}`, remove: () => onChange({ ...value, stageIds: value.stageIds.filter((x) => x !== id) }) });
  for (const k of value.origins) {
    const o = origins.find((x) => x.key === k);
    chips.push({ key: `o-${k}`, label: `${o ? KIND_LABEL[o.kind] : "Origem"}: ${o?.label ?? k.split(":")[1]}`, remove: () => onChange({ ...value, origins: value.origins.filter((x) => x !== k) }) });
  }
  for (const s of value.tags) chips.push({ key: `g-${s}`, label: `Tag: ${tags.find((t) => t.slug.toLowerCase() === s.toLowerCase())?.name ?? s}`, remove: () => onChange({ ...value, tags: value.tags.filter((x) => x !== s) }) });

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
      {chips.map((c) => (
        <span key={c.key} className="flex max-w-full items-center gap-1 rounded-full border bg-card py-0.5 pl-2.5 pr-1 text-xs font-medium">
          <span className="truncate">{c.label}</span>
          <button type="button" onClick={c.remove} aria-label={`Remover ${c.label}`} className="rounded-full p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
        </span>
      ))}
      {value.tags.length > 1 && <span className="text-xs text-muted-foreground">({value.tagMode === "all" ? "todas as tags" : "qualquer tag"})</span>}
      <button type="button" onClick={() => onChange(EMPTY_BOARD_FILTERS)} className="text-xs font-semibold text-primary hover:underline">Limpar tudo</button>
    </div>
  );
}
