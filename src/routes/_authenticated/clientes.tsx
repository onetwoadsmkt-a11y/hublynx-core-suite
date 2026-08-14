import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Users, Pencil, Eye, FileSpreadsheet } from "lucide-react";
import { listAllLeads } from "@/lib/pipeline/pipeline.functions";
import { LeadViewDialog } from "@/components/pipeline/LeadViewDialog";
import { LeadFormDialog } from "@/components/pipeline/LeadFormDialog";
import { exportLeadsToExcel } from "@/lib/pipeline/export-leads";
import type { Lead } from "@/components/pipeline/types";


function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function currency(v: number | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

const searchSchema = z.object({
  q: z.string().catch("").default(""),
  pipeline: z.string().catch("todos").default("todos"),
  stage: z.string().catch("todos").default("todos"),
  sort: z.enum(["recent", "name", "value"]).catch("recent").default("recent"),
  view: z.string().uuid().optional(),
});
type LeadsSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "LEADS — Hublynx Core" },
      {
        name: "description",
        content: "Lista completa dos leads do pipeline de vendas, com etapa, origem e valor.",
      },
      { property: "og:title", content: "LEADS — Hublynx Core" },
      {
        property: "og:description",
        content: "Lista completa dos leads do pipeline de vendas, com etapa, origem e valor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Partial<LeadsSearch> => searchSchema.parse(s),
  component: LeadsPage,
});

function LeadsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/clientes" });
  const listFn = useServerFn(listAllLeads);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["pipeline", "all-leads"],
    queryFn: () => listFn(),
  });

  const pipelines = data?.pipelines ?? [];
  const stages = data?.stages ?? [];
  const all = (data?.leads ?? []) as Lead[];

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const pipelineById = useMemo(() => new Map(pipelines.map((p) => [p.id, p])), [pipelines]);

  const stageOptions = useMemo(
    () =>
      search.pipeline && search.pipeline !== "todos"
        ? stages.filter((s) => s.pipeline_id === search.pipeline)
        : stages,
    [stages, search.pipeline],
  );

  const filtered = useMemo(() => {
    const q = (search.q ?? "").trim().toLowerCase();
    let rows = all.filter((l) => {
      const stage = l.stage_id ? stageById.get(l.stage_id) : undefined;
      if (search.pipeline && search.pipeline !== "todos" && stage?.pipeline_id !== search.pipeline)
        return false;
      if (search.stage && search.stage !== "todos" && l.stage_id !== search.stage) return false;
      if (q) {
        const hay = `${l.name} ${l.company ?? ""} ${l.email ?? ""} ${l.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (search.sort === "name") rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (search.sort === "value")
      rows = [...rows].sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
    return rows;
  }, [all, search, stageById]);

  const viewing = useMemo(
    () => (search.view ? all.find((l) => l.id === search.view) ?? null : null),
    [all, search.view],
  );

  const viewingStage = viewing?.stage_id ? stageById.get(viewing.stage_id) : undefined;
  const viewingPipeline = viewingStage?.pipeline_id
    ? pipelineById.get(viewingStage.pipeline_id)?.name
    : undefined;


  function setParam<K extends keyof LeadsSearch>(key: K, value: LeadsSearch[K]) {
    navigate({ to: "/clientes", search: (prev: Partial<LeadsSearch>) => ({ ...prev, [key]: value }) });
  }

  const total = filtered.reduce((s, l) => s + Number(l.value ?? 0), 0);

  return (
    <>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" /> LEADS
            </h1>
            <p className="text-sm text-muted-foreground">
              Todos os leads do pipeline de vendas — {filtered.length} lead(s) · {currency(total)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={filtered.length === 0}
              onClick={() =>
                exportLeadsToExcel(
                  filtered,
                  stageById,
                  new Map(pipelines.map((p) => [p.id, p.name])),
                )
              }
            >
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Exportar Excel
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo lead
            </Button>
          </div>

        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search.q ?? ""}
              onChange={(e) => setParam("q", e.target.value)}
              placeholder="Buscar nome, empresa, e-mail, telefone…"
              className="pl-8"
            />
          </div>
          <Select
            value={search.pipeline ?? "todos"}
            onValueChange={(v) => {
              setParam("pipeline", v);
              setParam("stage", "todos");
            }}
          >
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os pipelines</SelectItem>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={search.stage ?? "todos"} onValueChange={(v) => setParam("stage", v)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as etapas</SelectItem>
              {stageOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={search.sort ?? "recent"} onValueChange={(v) => setParam("sort", v as LeadsSearch["sort"])}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="name">Nome (A–Z)</SelectItem>
              <SelectItem value="value">Maior valor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando leads…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {all.length === 0
                ? "Nenhum lead no pipeline ainda."
                : "Nenhum lead corresponde aos filtros."}
            </p>
            {all.length === 0 && (
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro lead
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead className="hidden md:table-cell">Etapa</TableHead>
                  <TableHead className="hidden lg:table-cell">Pipeline</TableHead>
                  <TableHead className="hidden md:table-cell">Contato</TableHead>
                  <TableHead className="hidden lg:table-cell">Origem</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const stage = l.stage_id ? stageById.get(l.stage_id) : undefined;
                  const pipe = stage?.pipeline_id ? pipelineById.get(stage.pipeline_id) : undefined;
                  return (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer"
                      onClick={() => setParam("view", l.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                              {initials(l.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{l.name}</p>
                            {l.company && (
                              <p className="text-xs text-muted-foreground truncate">{l.company}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {stage ? (
                          <Badge
                            variant="outline"
                            style={{ borderColor: stage.color, color: stage.color }}
                          >
                            {stage.name}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem etapa</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {pipe?.name ?? "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        <div className="truncate max-w-[200px]">{l.email || "—"}</div>
                        {l.phone && <div className="text-xs">{l.phone}</div>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {l.utm_source ?? l.source ?? "—"}
                        {l.utm_campaign && (
                          <div className="truncate max-w-[140px]">{l.utm_campaign}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {currency(l.value != null ? Number(l.value) : null)}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(l)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setParam("view", l.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <LeadFormDialog open={createOpen} onOpenChange={setCreateOpen} stages={stages} />
      <LeadFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        stages={stages}
        lead={editing}
      />
      <LeadViewDialog
        lead={viewing}
        stage={viewingStage}
        pipelineName={viewingPipeline}
        onOpenChange={(o: boolean) => !o && setParam("view", undefined as never)}
        onEdit={(l: Lead) => {
          setParam("view", undefined as never);
          setEditing(l);
        }}
      />

    </>
  );
}
