import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Lock, MessageSquare, Send, UserRound, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePortalSession } from "@/components/portal/PortalShell";
import {
  portalPurchaseOrderUrl,
  portalPurchases,
  portalSheetMessage,
  type PortalPurchaseSheet,
  type PortalTeamMember,
} from "@/lib/portal/portal.functions";
import { calcValue, toNumber, validityState, type CostColumn } from "@/lib/projects/cost-presets";
import { cn } from "@/lib/utils";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmtDate(v: unknown) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return typeof v === "string" ? v : "";
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function cellValue(c: CostColumn, row: Record<string, unknown>, cols: CostColumn[]): number | null {
  return c.type === "calc" ? calcValue(c, row, cols) : toNumber(row[c.key]);
}

function Cell({ c, row, cols }: { c: CostColumn; row: Record<string, unknown>; cols: CostColumn[] }) {
  const v = row[c.key];
  switch (c.type) {
    case "currency":
      return <>{toNumber(v) === null ? "" : BRL.format(toNumber(v)!)}</>;
    case "number":
      return <>{toNumber(v)?.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) ?? ""}</>;
    case "percent":
      return <>{toNumber(v) === null ? "" : `${toNumber(v)!.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}</>;
    case "calc": {
      const n = calcValue(c, row, cols);
      if (n === null) return null;
      if (c.calc?.asPercent) return <>{`${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}</>;
      if (c.calc?.asCurrency || c.sum) return <>{BRL.format(n)}</>;
      return <>{n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</>;
    }
    case "date":
      return <>{fmtDate(v)}</>;
    case "boolean":
      return <>{v === true || v === "true" ? "Sim" : v === false || v === "false" ? "Não" : ""}</>;
    case "status": {
      const opt = c.options?.find((o) => o.label === v);
      if (!v) return null;
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${opt?.color ?? "#64748b"}22`, color: opt?.color }}>
          {String(v)}
        </span>
      );
    }
    case "validity": {
      const st = validityState(c.validity?.ref ? row[c.validity.ref] : null);
      if (!st) return null;
      const tone = { ok: "bg-emerald-100 text-emerald-800", warn: "bg-amber-100 text-amber-900", action: "bg-orange-100 text-orange-900", info: "bg-sky-100 text-sky-900", late: "bg-rose-100 text-rose-800" }[st.tone];
      return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>{st.label}</span>;
    }
    default:
      return <>{v === null || v === undefined ? "" : String(v)}</>;
  }
}

function SheetTable({
  sheet,
  projectId,
  session,
  team = [],
}: {
  sheet: PortalPurchaseSheet;
  projectId: string;
  session: ReturnType<typeof usePortalSession>;
  team?: PortalTeamMember[];
}) {
  const urlFn = useServerFn(portalPurchaseOrderUrl);
  const [busy, setBusy] = useState(false);
  const cols = sheet.columns.filter((c) => !c.key.startsWith("__"));
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of cols) if (c.sum) t[c.key] = sheet.rows.reduce((a, r) => a + (cellValue(c, r.data, cols) ?? 0), 0);
    return t;
  }, [cols, sheet.rows]);
  const totalCol = cols.find((c) => c.key === sheet.info.totalKey && c.sum);
  const itemsTotal = totalCol ? totals[totalCol.key] ?? 0 : null;
  const adjustments = (sheet.info.adjustments ?? []).filter((a) => a.value);
  const grand = itemsTotal === null ? null : itemsTotal + adjustments.reduce((a, x) => a + (x.value ?? 0), 0);
  const order = sheet.info.order ?? {};
  const fields = (sheet.info.fields ?? []).filter((f) => f.value);

  return (
    <div className="space-y-3">
      {(sheet.orderFile || order.number || order.date) && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-primary/40 p-3">
          <FileText className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Pedido de compra{order.number ? ` nº ${order.number}` : ""}</p>
            <p className="text-xs text-muted-foreground">
              {[order.date ? `emitido em ${fmtDate(order.date)}` : null, sheet.orderFile?.name].filter(Boolean).join(" · ") || "sem arquivo"}
            </p>
          </div>
          {sheet.orderFile && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const { url } = await session.call((token) =>
                    urlFn({ data: { token, projectId, sheetId: sheet.id, fileId: sheet.orderFile!.id } }),
                  );
                  window.open(url, "_blank", "noopener");
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar pedido
            </Button>
          )}
        </div>
      )}

      {fields.length > 0 && (
        <dl className="grid gap-x-4 gap-y-2 rounded-2xl bg-muted/40 p-3 text-sm [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {fields.map((f) => (
            <div key={f.key} className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{f.label}</dt>
              <dd className="truncate font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {sheet.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item lançado ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-[var(--brand-ink,#0A173C)] text-left text-[11px] font-bold uppercase tracking-wide text-white">
                {cols.map((c) => (
                  <th key={c.key} className={cn("px-3 py-2.5", ["currency", "number", "percent", "calc"].includes(c.type) && "text-right")}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => (
                <tr key={r.id} className="border-t">
                  {cols.map((c) => (
                    <td key={c.key} className={cn("px-3 py-2", ["currency", "number", "percent", "calc"].includes(c.type) && "text-right tabular-nums")}>
                      <Cell c={c} row={r.data} cols={cols} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {cols.some((c) => c.sum) && (
              <tfoot>
                <tr className="border-t-2 bg-muted/50 font-bold">
                  {cols.map((c, i) => (
                    <td key={c.key} className={cn("px-3 py-2", c.sum && "text-right tabular-nums")}>
                      {c.sum ? (c.type === "number" ? totals[c.key].toLocaleString("pt-BR") : BRL.format(totals[c.key])) : i === 0 ? "Total" : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {grand !== null && (
        <div className="ml-auto max-w-sm space-y-1 rounded-2xl border p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Total dos itens</span><span className="tabular-nums">{BRL.format(itemsTotal!)}</span></div>
          {adjustments.map((a) => (
            <div key={a.key} className="flex justify-between"><span className="text-muted-foreground">{a.label}</span><span className="tabular-nums">{BRL.format(a.value!)}</span></div>
          ))}
          <div className="flex justify-between border-t pt-1.5 text-base font-extrabold"><span>Total geral</span><span className="tabular-nums">{BRL.format(grand)}</span></div>
        </div>
      )}
      <SheetChat sheet={sheet} team={team} projectId={projectId} session={session} />
    </div>
  );
}

/** Rodapé da planilha: conversa com a equipe (toda a equipe ou uma pessoa). */
function SheetChat({
  sheet,
  team,
  projectId,
  session,
}: {
  sheet: PortalPurchaseSheet;
  team: PortalTeamMember[];
  projectId: string;
  session: ReturnType<typeof usePortalSession>;
}) {
  const qc = useQueryClient();
  const sendFn = useServerFn(portalSheetMessage);
  const [body, setBody] = useState("");
  const [to, setTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [all, setAll] = useState(false);
  const toName = to ? team.find((m) => m.id === to)?.name ?? null : null;
  const list = sheet.messages ?? [];
  const shown = all ? list : list.slice(-4);
  async function send() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      await session.call((token) => sendFn({ data: { token, projectId, sheetId: sheet.id, body: text, recipientId: to } }));
      setBody("");
      toast.success(toName ? `Mensagem enviada para ${toName.split(" ")[0]}` : "Mensagem enviada para a equipe");
      qc.invalidateQueries({ queryKey: ["portal-purchases", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <div id="planilha-conversa" className="scroll-mt-28 space-y-2 rounded-2xl border bg-muted/30 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4" /> Conversa sobre esta planilha
      </p>
      {list.length > 4 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-medium text-primary hover:underline">
          {all ? "Mostrar só as últimas" : `Ver todas as mensagens (${list.length})`}
        </button>
      )}
      {shown.length === 0 && <p className="text-xs text-muted-foreground">Dúvida sobre algum item? Escreva para a equipe aqui.</p>}
      {shown.map((m) => (
        <div
          key={m.id}
          className={cn(
            "max-w-[92%] rounded-xl px-3 py-2 text-sm",
            m.author_kind === "cliente" ? "ml-auto bg-amber-50 ring-1 ring-amber-200/70" : "bg-background ring-1 ring-black/[0.06]",
          )}
        >
          <p className="mb-0.5 text-[11px] text-muted-foreground">
            <strong className="text-foreground">{m.mine ? "Você" : m.author}</strong>
            {m.author_kind === "cliente" ? (m.recipient ? ` → ${m.recipient}` : " → toda a equipe") : " (equipe)"} ·{" "}
            {new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          maxLength={4000}
          placeholder={toName ? `Mensagem para ${toName.split(" ")[0]}…` : "Mensagem para a equipe…"}
          aria-label={`Mensagem sobre a planilha ${sheet.name}`}
          className="h-11 min-w-0 flex-1 bg-background"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-11 max-w-[150px] shrink-0 items-center gap-1 rounded-md border bg-background px-2.5 text-xs font-medium",
                to ? "border-primary" : "text-muted-foreground",
              )}
              aria-label={`Destino: ${toName ?? "toda a equipe"}. Clique para trocar.`}
            >
              {to ? <UserRound className="h-3.5 w-3.5 shrink-0" /> : <Users className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{toName ? toName.split(" ")[0] : "Equipe"}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
            <DropdownMenuItem onSelect={() => setTo(null)}>
              <Users className="h-4 w-4" /> Toda a equipe
              {!to && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
            {team.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Direcionar para</DropdownMenuLabel>
                {team.map((m) => (
                  <DropdownMenuItem key={m.id} onSelect={() => setTo(m.id)}>
                    <UserRound className="h-4 w-4" />
                    <span className="truncate">{m.name}</span>
                    {to === m.id && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="icon" className="h-11 w-11 shrink-0" disabled={!body.trim() || sending} onClick={send} aria-label="Enviar mensagem">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" /> A planilha é só para consulta; as alterações são feitas pela equipe.
      </p>
    </div>
  );
}

/** Seção "Planilhas do projeto": as planilhas do Comercial liberadas pela equipe (só para ver) + conversa. */
export function PortalPurchases({
  projectId,
  session,
  focusSheet = null,
  focusKey = null,
}: {
  projectId: string;
  session: ReturnType<typeof usePortalSession>;
  /** aviso de mensagem na planilha (?planilha=<id>) */
  focusSheet?: string | null;
  focusKey?: string | null;
}) {
  const fn = useServerFn(portalPurchases);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["portal-purchases", projectId],
    queryFn: () => session.call((token) => fn({ data: { token, projectId } })),
    enabled: session.ready,
    refetchInterval: 60_000,
  });
  const sheets = q.data?.enabled ? q.data.sheets : [];
  const team = q.data?.team ?? [];
  const [active, setActive] = useState<string | null>(null);
  // aviso de mensagem na planilha (?planilha=<id>): abre a planilha e rola até ela
  const wanted = focusSheet;
  useEffect(() => {
    if (!wanted || !sheets.some((s) => s.id === wanted)) return;
    setActive(wanted);
    qc.invalidateQueries({ queryKey: ["portal-purchases", projectId] });
    setTimeout(() => document.getElementById("planilha-conversa")?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, focusKey, sheets.length]);
  if (!sheets.length) return null;
  const cur = sheets.find((s) => s.id === active) ?? sheets[0];
  return (
    <section
      id="planilhas"
      aria-label="Planilhas do projeto"
      className="rounded-3xl bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_40px_-20px_rgba(16,24,40,0.22)] dark:ring-1 dark:ring-white/10 sm:p-7"
    >
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <FileSpreadsheet className="h-4 w-4" /> Planilhas do projeto
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">Planilhas liberadas pela equipe, somente para consulta. Use a conversa no fim de cada planilha para falar com a equipe.</p>
      {sheets.length > 1 && (
        <div role="tablist" aria-label="Planilhas" className="mb-3 flex flex-wrap gap-1">
          {sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === cur.id}
              onClick={() => setActive(s.id)}
              className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", s.id === cur.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <SheetTable key={cur.id} sheet={cur} projectId={projectId} session={session} team={team} />
    </section>
  );
}
