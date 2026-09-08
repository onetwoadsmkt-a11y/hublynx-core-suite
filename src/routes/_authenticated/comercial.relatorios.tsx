import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLeadsReport } from "@/lib/pipeline/report.functions";
import { useWorkspace } from "@/hooks/useWorkspace";
import { exportLeadsReportToExcel } from "@/lib/pipeline/export-report";
import { DEFAULT_FIELDS, LEAD_FIELDS, type LeadFieldKey } from "@/lib/pipeline/report-fields";

export const Route = createFileRoute("/_authenticated/comercial/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios de leads — Hublynx Core" },
      {
        name: "description",
        content:
          "Exporte leads com dados de contato, trackeamento, anotações e histórico de jornada em Excel.",
      },
      { property: "og:title", content: "Relatórios de leads — Hublynx Core" },
      {
        property: "og:description",
        content: "Relatório personalizado de leads com anotações e jornada completa em Excel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosComerciaisPage,
});

const GROUPS = ["Contato", "Comercial", "Trackeamento", "Datas"] as const;

function RelatoriosComerciaisPage() {
  const [pipelineId, setPipelineId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fields, setFields] = useState<LeadFieldKey[]>(DEFAULT_FIELDS);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeJourney, setIncludeJourney] = useState(true);
  const [exporting, setExporting] = useState(false);

  const reportFn = useServerFn(getLeadsReport);
  const { activeWorkspaceId, isLoading: wsLoading } = useWorkspace();
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["leads-report", pipelineId, from, to, activeWorkspaceId ?? "none"],
    queryFn: () =>
      reportFn({
        data: {
          pipelineId: pipelineId === "all" ? null : pipelineId,
          from: from || null,
          to: to || null,
          ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
        },
      }),
    enabled: !wsLoading,
  });

  const pipelines = data?.pipelines ?? [];
  const leads = data?.leads ?? [];
  const stats = useMemo(
    () => ({
      leads: leads.length,
      notes: data?.notes.length ?? 0,
      events: data?.events.length ?? 0,
    }),
    [leads.length, data?.notes.length, data?.events.length],
  );

  const toggle = (key: LeadFieldKey) =>
    setFields((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]));

  async function handleExport() {
    if (!data) return;
    if (fields.length === 0) {
      toast.error("Selecione ao menos um campo");
      return;
    }
    setExporting(true);
    try {
      exportLeadsReportToExcel(
        {
          leads: data.leads,
          stages: data.stages,
          pipelines: data.pipelines,
          notes: data.notes,
          events: data.events,
        },
        { fields, includeNotes, includeJourney },
      );
      toast.success("Relatório exportado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Relatórios de leads</h1>
          <p className="text-sm text-muted-foreground">
            Exporte contatos, trackeamento, anotações e jornada em planilhas Excel.
          </p>
        </div>
        <Button onClick={handleExport} disabled={exporting || isFetching || !data}>
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="mr-2 h-4 w-4" />
          )}
          Exportar Excel
        </Button>
      </header>

      <Card className="grid gap-3 p-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Pipeline</Label>
          <Select value={pipelineId} onValueChange={setPipelineId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button variant="outline" className="w-full" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Atualizar prévia
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>
            <strong className="tabular-nums">{stats.leads}</strong> leads
          </span>
          <span>
            <strong className="tabular-nums">{stats.notes}</strong> anotações
          </span>
          <span>
            <strong className="tabular-nums">{stats.events}</strong> eventos de jornada
          </span>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
            Relatório personalizado
          </h2>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setFields(DEFAULT_FIELDS)}>
              Selecionar tudo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFields([])}>
              Limpar
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GROUPS.map((group) => (
            <div key={group} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              {LEAD_FIELDS.filter((f) => f.group === group).map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={fields.includes(f.key)}
                    onCheckedChange={() => toggle(f.key)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={includeNotes}
              onCheckedChange={(v) => setIncludeNotes(v === true)}
            />
            Incluir anotações (uma coluna por anotação + aba dedicada)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={includeJourney}
              onCheckedChange={(v) => setIncludeJourney(v === true)}
            />
            Incluir histórico de jornada (uma coluna por evento + aba dedicada)
          </label>
        </div>
      </Card>
    </div>
  );
}
