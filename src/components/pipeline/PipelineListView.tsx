import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currency, leadScoreTone } from "@/components/pipeline/LeadCard";
import type { Lead, PipelineStage } from "@/components/pipeline/types";
import type { TaskStat } from "@/lib/pipeline/report-filters";
import { cn } from "@/lib/utils";

type SortKey = "name" | "stage" | "value" | "temperature" | "task" | "origin" | "created";
type TagLite = { slug: string; name: string; color?: string };

const PAGE = 50;
const TEMP: Record<string, { label: string; cls: string; rank: number }> = {
  quente: { label: "Quente", cls: "bg-score-hot/10 text-score-hot", rank: 3 },
  morno: { label: "Morno", cls: "bg-score-warm/10 text-score-warm", rank: 2 },
  frio: { label: "Frio", cls: "bg-score-cold/10 text-score-cold", rank: 1 },
};
const TONE_TO_TEMP: Record<string, string> = { hot: "quente", warm: "morno", cold: "frio" };

export const tempOf = (l: Lead) => {
  const t = (l.temperature ?? "").toLowerCase();
  return TEMP[t] ? t : TONE_TO_TEMP[leadScoreTone(l.lead_classification)] ?? "";
};
const originOf = (l: Lead) =>
  [l.source, l.utm_source && `utm: ${l.utm_source}`, l.utm_campaign].filter(Boolean).join(" · ") ||
  (l.gclid ? "Anúncio Google" : l.fbclid ? "Anúncio Meta" : "");
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function PipelineListView({
  leads, stages, tags, stats, onOpen, onEdit, onMove, onBulkMove,
}: {
  leads: Lead[];
  stages: PipelineStage[];
  tags: TagLite[];
  stats: Map<string, TaskStat>;
  onOpen: (l: Lead) => void;
  onEdit: (l: Lead) => void;
  onMove: (l: Lead, stageId: string) => void;
  onBulkMove: (ids: string[], stageId: string) => Promise<void>;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "created", dir: -1 });
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState("");
  const [busy, setBusy] = useState(false);

  const stageById = useMemo(() => new Map(stages.map((s, i) => [s.id, { ...s, idx: i }])), [stages]);
  const tagName = useMemo(() => new Map(tags.map((t) => [t.slug.toLowerCase(), t])), [tags]);

  // Some da seleção quem saiu do filtro.
  useEffect(() => {
    const ids = new Set(leads.map((l) => l.id));
    setSelected((cur) => { const next = new Set([...cur].filter((id) => ids.has(id))); return next.size === cur.size ? cur : next; });
  }, [leads]);

  const rows = useMemo(() => {
    const val = (l: Lead): string | number => {
      switch (sort.key) {
        case "name": return (l.name ?? "").toLowerCase();
        case "stage": return stageById.get(l.stage_id ?? "")?.idx ?? 999;
        case "value": return Number(l.value ?? 0);
        case "temperature": return TEMP[tempOf(l)]?.rank ?? 0;
        case "task": {
          const s = stats.get(l.id);
          // Atrasadas primeiro, depois a próxima mais cedo, por último sem tarefa.
          if (!s || !s.open) return Number.MAX_SAFE_INTEGER;
          if (s.overdue) return -s.overdue;
          return s.next ? new Date(s.next).getTime() : Number.MAX_SAFE_INTEGER - 1;
        }
        case "origin": return originOf(l).toLowerCase() || "~";
        default: return new Date(l.created_at ?? 0).getTime();
      }
    };
    return [...leads].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [leads, sort, stageById, stats]);

  const shown = rows.slice(0, limit);
  const allShown = shown.length > 0 && shown.every((l) => selected.has(l.id));
  const totalValue = leads.reduce((s, l) => s + Number(l.value ?? 0), 0);

  const head = (key: SortKey, label: string, cls = "") => {
    const on = sort.key === key;
    const Icon = !on ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th scope="col" className={cn("whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground", cls)}
        aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" className={cn("inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground", on && "text-foreground")}
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" || key === "stage" || key === "task" ? 1 : -1 }))}>
          {label}<Icon className="h-3.5 w-3.5" />
        </button>
      </th>
    );
  };

  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 pb-16">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm">
          <span className="text-sm font-semibold">{selected.size} selecionado(s)</span>
          <Select value={bulkStage} onValueChange={setBulkStage}>
            <SelectTrigger className="h-8 w-[200px]" aria-label="Mover para etapa"><SelectValue placeholder="Mover para etapa…" /></SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8" disabled={!bulkStage || busy}
            onClick={async () => { setBusy(true); try { await onBulkMove([...selected], bulkStage); setSelected(new Set()); setBulkStage(""); } finally { setBusy(false); } }}>
            {busy ? "Movendo…" : "Mover"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th scope="col" className="w-10 px-3 py-2.5">
                <Checkbox aria-label="Selecionar todos os exibidos" checked={allShown}
                  onCheckedChange={(v) => setSelected((cur) => { const n = new Set(cur); shown.forEach((l) => (v ? n.add(l.id) : n.delete(l.id))); return n; })} />
              </th>
              {head("name", "Lead", "sticky left-0 bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]")}
              {head("stage", "Etapa")}
              {head("value", "Valor", "text-right")}
              {head("temperature", "Temperatura")}
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Tags</th>
              {head("task", "Tarefas")}
              {head("origin", "Origem")}
              {head("created", "Entrada")}
              <th scope="col" className="w-10 px-2" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-12 text-center text-muted-foreground">Nenhum lead com estes filtros.</td></tr>
            )}
            {shown.map((l) => {
              const st = stats.get(l.id);
              const t = TEMP[tempOf(l)];
              const ltags = ((l as any).tags as string[] | null) ?? [];
              const stage = stageById.get(l.stage_id ?? "");
              return (
                <tr key={l.id} className={cn("group border-b last:border-b-0 hover:bg-muted/40", selected.has(l.id) && "bg-primary/5")}>
                  <td className="px-3 py-2"><Checkbox aria-label={`Selecionar ${l.name}`} checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} /></td>
                  <td className={cn(
                    "sticky left-0 max-w-[260px] px-3 py-2",
                    selected.has(l.id)
                      ? "bg-[color-mix(in_oklab,var(--primary)_5%,var(--card))]"
                      : "bg-card group-hover:bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]",
                  )}>
                    <button type="button" onClick={() => onOpen(l)} className="block max-w-full text-left">
                      <span className="block truncate font-semibold hover:text-primary hover:underline">{l.name || "Sem nome"}</span>
                      <span className="block truncate text-xs text-muted-foreground">{l.company || l.email || l.phone || "—"}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Select value={l.stage_id ?? ""} onValueChange={(v) => onMove(l, v)}>
                      <SelectTrigger
                        className="h-8 w-[200px] gap-2 !border-transparent !bg-transparent px-2 !shadow-none hover:!border-input"
                        aria-label={`Etapa de ${l.name}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage?.color ?? "#94A3B8" }} />
                          <div className="truncate text-left">{stage?.name ?? "Sem etapa"}</div>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{Number(l.value ?? 0) ? currency(Number(l.value)) : "—"}</td>
                  <td className="px-3 py-2">{t ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", t.cls)}>{t.label}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="max-w-[220px] px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {ltags.slice(0, 2).map((g) => {
                        const tag = tagName.get(String(g).toLowerCase());
                        return (
                          <span key={g} className="max-w-[140px] truncate rounded border px-1.5 py-0.5 text-[11px]" style={tag?.color ? { borderColor: tag.color } : undefined}>
                            {tag?.name ?? g}
                          </span>
                        );
                      })}
                      {ltags.length > 2 && <span className="text-[11px] text-muted-foreground">+{ltags.length - 2}</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {!st || !st.open ? (
                      <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><span className="h-2 w-2 rounded-full bg-amber-400" />Sem tarefas</span>
                    ) : st.overdue ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-500" />{st.overdue} atrasada(s)</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />{st.next ? fmtDateTime(st.next) : `${st.open} sem data`}</span>
                    )}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground" title={originOf(l)}>{originOf(l) || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{l.created_at ? fmtDate(l.created_at) : "—"}</td>
                  <td className="px-2 py-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar ${l.name}`} onClick={() => onEdit(l)}><Pencil className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {leads.length > 0 && (
            <tfoot className="border-t bg-muted/40 text-xs font-semibold">
              <tr>
                <td />
                <td className="px-3 py-2.5">{leads.length} leads</td>
                <td />
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{currency(totalValue)}</td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > limit && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE * 2)}>
            Mostrar mais ({rows.length - limit} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}
