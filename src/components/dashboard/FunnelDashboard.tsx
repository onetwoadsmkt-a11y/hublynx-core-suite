import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, Target } from "lucide-react";
import { BLOCKS, STEPS, type GoalFunnel, type StepKey } from "@/lib/pipeline/funnel-goals";
import { maskBRL } from "@/lib/security/value-lock";
import { cn } from "@/lib/utils";
import { useBrandPalette } from "@/hooks/useBrandPalette";
import { funnelPalette, type FunnelPalette } from "@/lib/brand/funnel-palette";

const fmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const money = (v: number) => maskBRL(v, { notation: "compact", maximumFractionDigits: 1 });

const BLOCK_HINT = { topo: "Atrair e conectar", meio: "Reunir e qualificar", fundo: "Propor e fechar" } as const;
// Larguras das faixas (afunilando) e o recorte inclinado que encaixa na faixa de baixo.
const WIDTHS = [100, 86, 72, 60, 50, 40, 32];
const clip = (i: number) => {
  const d = ((WIDTHS[i] - WIDTHS[i + 1]) / (2 * WIDTHS[i])) * 100;
  return `polygon(0 0, 100% 0, ${100 - d}% 100%, ${d}% 100%)`;
};

function Card({ className, children, dark }: { className?: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={cn(
      "rounded-2xl p-5",
      dark ? "bg-[var(--fx-dark)] text-white dark:ring-1 dark:ring-white/10" : "bg-card shadow-[0_1px_2px_rgba(10,37,87,.06),0_10px_28px_rgba(10,37,87,.07)] dark:border",
      className,
    )}>
      {children}
    </div>
  );
}

export function FunnelDashboard({
  f, prev, onOpenGoals, brand: brandOverride,
}: { f: GoalFunnel; prev: GoalFunnel; onOpenGoals: () => void; brand?: { primary: string; ink: string } }) {
  const autoBrand = useBrandPalette();
  const brand = brandOverride ?? autoBrand;
  const pal: FunnelPalette = useMemo(() => funnelPalette(brand.primary, brand.ink), [brand.primary, brand.ink]);
  const LAYER = pal.layers;
  const vars = {
    "--fx-dark": pal.dark,
    ...Object.fromEntries((["topo", "meio", "fundo"] as const).flatMap((k) => [[`--fx-${k}`, pal.blocks[k].light], [`--fx-${k}-dk`, pal.blocks[k].dark]])),
  } as React.CSSProperties;
  const blockText = (k: "topo" | "meio" | "fundo") =>
    ({ topo: "text-[color:var(--fx-topo)] dark:text-[color:var(--fx-topo-dk)]", meio: "text-[color:var(--fx-meio)] dark:text-[color:var(--fx-meio-dk)]", fundo: "text-[color:var(--fx-fundo)] dark:text-[color:var(--fx-fundo-dk)]" })[k];
  const byKey = new Map(f.steps.map((s) => [s.key, s]));
  const objIdx = STEPS.indexOf(f.objective.key);
  const won = byKey.get("ganho")!;
  const ticket = won.count > 0 ? f.wonValue / won.count : 0;
  const agendadas = byKey.get("agendada")!.count;
  const realizadas = byKey.get("realizada")!.count;
  const attend = agendadas > 0 ? (realizadas / agendadas) * 100 : 0;
  const leadDelta = prev.total > 0 ? ((f.total - prev.total) / prev.total) * 100 : null;
  const ppDelta = prev.total > 0 ? f.objective.rate - prev.objective.rate : null;
  const worstLabel = f.worst ? `${byKey.get(f.worst.from)!.label} → ${byKey.get(f.worst.to)!.label}` : null;

  return (
    <div className="flex flex-col gap-4 sm:gap-5" style={vars}>
      {/* Indicadores */}
      <section aria-label="Indicadores do funil" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card dark className="col-span-2 flex flex-col gap-1.5 lg:col-span-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/70"><Target className="h-3.5 w-3.5" /> Conversão do objetivo</span>
          <span className="text-[32px] font-extrabold tracking-tight tabular-nums">{fmt(f.objective.rate)}</span>
          <span className="text-[13px] text-white/80">{f.objective.count} de {f.total} chegaram a <strong>{f.objective.label}</strong></span>
          {f.objective.target != null && (
            <span className={cn("mt-1 self-start rounded-full px-2 py-0.5 text-[11px] font-bold", f.objective.belowTarget ? "bg-rose-500/20 text-rose-200" : "bg-emerald-400/20 text-emerald-200")}>
              Meta {fmt(f.objective.target)} · {f.objective.belowTarget ? `faltam ${fmt(f.objective.target - f.objective.rate)}` : "atingida"}
            </span>
          )}
        </Card>
        <Card className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leads no período</span>
          <span className="text-[30px] font-extrabold tracking-tight tabular-nums">{f.total}</span>
          <span className="text-[12px] text-muted-foreground">
            {leadDelta == null ? "sem período anterior" : <span className={leadDelta >= 0 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "font-semibold text-rose-600"}>{leadDelta >= 0 ? "▲" : "▼"} {fmt(Math.abs(leadDelta))} vs. anterior</span>}
            {f.leadsTarget != null && <> · meta {f.leadsTarget}</>}
          </span>
        </Card>
        <Card className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Receita ganha</span>
          <span className="truncate text-[30px] font-extrabold tracking-tight tabular-nums">{money(f.wonValue)}</span>
          <span className="text-[12px] text-muted-foreground">Ticket médio {money(ticket)}</span>
        </Card>
        <Card className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comparecimento</span>
          <span className="text-[30px] font-extrabold tracking-tight tabular-nums">{fmt(attend)}</span>
          <span className={cn("text-[12px]", f.exits.noshow ? "font-semibold text-rose-600" : "text-muted-foreground")}>{f.exits.noshow} no-show(s)</span>
        </Card>
        <Card className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vs. período anterior</span>
          <span className="text-[30px] font-extrabold tracking-tight tabular-nums">{ppDelta == null ? "—" : `${ppDelta >= 0 ? "+" : ""}${ppDelta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`}</span>
          <span className="text-[12px] text-muted-foreground">na conversão do objetivo</span>
        </Card>
      </section>

      <div className="flex flex-wrap items-stretch gap-4 sm:gap-5">
        {/* Funil */}
        <Card className="flex min-w-0 flex-[999_1_620px] flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-extrabold sm:text-[17px]">Topo, meio e fundo do funil</h2>
            <button type="button" onClick={onOpenGoals} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              <Target className="h-3.5 w-3.5" /> Objetivo: {f.objective.label}
            </button>
          </div>

          <div className="grid grid-cols-[52px_minmax(0,1fr)_84px] gap-x-2 gap-y-2.5 [grid-auto-rows:64px] sm:grid-cols-[88px_minmax(0,1fr)_150px] sm:gap-x-4 sm:[grid-auto-rows:76px]">
            {BLOCKS.map((b, bi) => (
              <div key={b.key} className="col-start-1 flex items-stretch gap-2" style={{ gridRow: `${bi * 2 + 1} / span 2` }}>
                <div className="w-1 rounded" style={{ background: pal.blocks[b.key].bar }} />
                <div className="flex flex-col justify-center">
                  <span className={cn("text-[12px] font-extrabold tracking-[0.1em] sm:text-[13px]", blockText(b.key))}>{b.label.toUpperCase()}</span>
                  <span className="hidden text-[11px] leading-tight text-muted-foreground sm:block">{BLOCK_HINT[b.key]}</span>
                </div>
              </div>
            ))}

            {f.steps.map((s, i) => {
              const c = LAYER[s.key];
              const isObj = i === objIdx;
              const beyond = i > objIdx;
              return (
                <div key={s.key} className="col-start-2 flex justify-center" style={{ gridRow: i + 1 }}>
                  <div
                    className="relative flex h-full min-w-[132px] flex-col items-center justify-center px-6 sm:min-w-0 sm:flex-row sm:gap-4"
                    style={{ width: `${WIDTHS[i]}%`, background: c.bg, color: c.fg, clipPath: clip(i), opacity: beyond ? 0.45 : 1 }}
                    title={`${s.label}: ${s.count} (${fmt(s.pctOfTotal)} do total)`}
                  >
                    {isObj && <Target aria-label="Objetivo" className="hidden h-4 w-4 shrink-0 sm:block" />}
                    <span className="max-w-full truncate text-[11px] font-semibold leading-tight sm:text-sm">{s.label}</span>
                    <span className="text-lg font-extrabold leading-tight tabular-nums sm:text-[26px]">{s.count}</span>
                    <span className="hidden text-[13px] sm:inline" style={{ color: c.sub }}>{fmt(s.pctOfTotal)}</span>
                  </div>
                </div>
              );
            })}

            {f.steps.slice(1).map((s, i) => {
              const isWorst = f.worst?.to === s.key;
              const bad = isWorst || s.belowTarget;
              return (
                <div key={s.key} className="col-start-3 flex items-center gap-1.5 self-end sm:gap-2" style={{ gridRow: i + 1, transform: "translateY(calc(50% + 5px))" }}>
                  <ArrowDown className={cn("h-4 w-4 shrink-0", bad ? "text-rose-600" : "text-muted-foreground")} aria-hidden="true" />
                  <div className="flex min-w-0 flex-col">
                    <span className={cn("text-[15px] font-extrabold tabular-nums", bad && "text-rose-600")}>{fmt(s.passFromPrev ?? 0)}</span>
                    <span className={cn("truncate text-[10px] sm:text-[11px]", bad ? "font-semibold text-rose-600" : "text-muted-foreground")}>
                      {isWorst ? "maior queda" : s.target != null ? `meta ${fmt(s.target)}` : "passaram"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            % dentro da faixa = sobre o total de leads do período · seta = quantos passaram para a etapa seguinte. Contagem cumulativa
            {"; "}faixas depois do objetivo ficam esmaecidas.
          </p>
        </Card>

        {/* Lateral */}
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 sm:gap-5">
          <Card className="flex flex-col gap-3">
            <h2 className="text-[15px] font-extrabold">Conversão entre etapas</h2>
            {f.steps.slice(1).map((s, i) => {
              const from = f.steps[i];
              const bad = f.worst?.to === s.key || s.belowTarget;
              const v = s.passFromPrev ?? 0;
              return (
                <div key={s.key} className="flex flex-col gap-1">
                  <div className={cn("flex justify-between gap-2 text-[13px]", bad && "text-rose-600")}>
                    <span className="truncate">{from.label} → {s.label}</span><strong className="tabular-nums">{fmt(v)}</strong>
                  </div>
                  <div className={cn("relative h-2 rounded-full", bad ? "bg-rose-100 dark:bg-rose-950" : "bg-muted")}>
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(100, v)}%`, background: bad ? "#D2553A" : LAYER[s.key].bg }} />
                    {s.target != null && <div className="absolute -top-1 h-4 w-0.5 rounded bg-foreground" style={{ left: `${Math.min(100, s.target)}%` }} title={`Meta ${fmt(s.target)}`} />}
                  </div>
                </div>
              );
            })}
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-[15px] font-extrabold">Saídas do funil</h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["perdido", "Perdidos", "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"],
                ["noshow", "No-show", "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"],
                ["nutricao", "Nutrição", "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"],
              ] as const).map(([k, l, tone]) => (
                <div key={k} className={cn("flex flex-col rounded-xl p-3", tone)}>
                  <span className="text-xl font-extrabold tabular-nums">{f.exits[k]}</span>
                  <span className="text-[12px] font-semibold">{l}</span>
                  <span className="text-[11px] opacity-80">{fmt(f.total ? (f.exits[k] / f.total) * 100 : 0)} dos leads</span>
                </div>
              ))}
            </div>
          </Card>

          {f.worst && (
            <Card dark className="flex flex-col gap-2.5">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-200"><AlertTriangle className="h-4 w-4" /> Gargalo do período</span>
              <p className="text-[15px] leading-snug">Só <strong>{fmt(f.worst.pass)}</strong> passam de <strong>{worstLabel}</strong>, a menor passagem até o objetivo.</p>
              <Link to="/relatorios" className="self-start rounded-lg px-3 py-2 text-[13px] font-bold hover:opacity-90" style={{ background: pal.accent, color: pal.accentFg }}>Abrir relatório comercial</Link>
            </Card>
          )}
        </aside>
      </div>

      {/* Blocos */}
      <section aria-label="Resumo por bloco" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {BLOCKS.map((b, bi) => {
          const [a, z] = b.steps.map((k) => byKey.get(k)!);
          const next = BLOCKS[bi + 1] ? byKey.get(BLOCKS[bi + 1].steps[0])! : null;
          const passNext = next && z.count > 0 ? (next.count / z.count) * 100 : null;
          return (
            <Card key={b.key} className="flex flex-col gap-3">
              <div className="-mt-5 -mx-5 mb-1 h-[5px] rounded-t-2xl" style={{ background: pal.blocks[b.key].bar }} />
              <div className="flex items-baseline justify-between">
                <span className={cn("text-[13px] font-extrabold tracking-[0.1em]", blockText(b.key))}>{b.label.toUpperCase()}</span>
                <span className="text-xs text-muted-foreground">{a.label} + {z.label}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col"><span className="text-2xl font-extrabold tabular-nums">{a.count}</span><span className="truncate text-[11px] text-muted-foreground">{a.label.toLowerCase()}</span></div>
                <div className="flex flex-col"><span className="text-2xl font-extrabold tabular-nums">{z.count}</span><span className="truncate text-[11px] text-muted-foreground">{z.label.toLowerCase()}</span></div>
                <div className="flex flex-col"><span className="text-2xl font-extrabold tabular-nums">{fmt(z.passFromPrev ?? 0)}</span><span className="text-[11px] text-muted-foreground">dentro do bloco</span></div>
              </div>
              <div className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground">
                {next ? <>Passam para o {BLOCKS[bi + 1].label.toLowerCase()}: <strong className="text-foreground">{fmt(passNext ?? 0)}</strong></> : <>Valor ganho: <strong className="text-foreground">{money(f.wonValue)}</strong></>}
              </div>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
