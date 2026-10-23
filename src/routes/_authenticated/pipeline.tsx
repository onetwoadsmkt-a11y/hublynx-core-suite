import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, closestCorners, pointerWithin,
  useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, horizontalListSortingStrategy, useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarDays, GripVertical, HardDrive, LayoutTemplate, Lock, Mail, Pencil, Plus, Search, Settings, Settings2, Tags, Trash2, Webhook, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LeadCard, currency } from "@/components/pipeline/LeadCard";
import { LeadDrawer } from "@/components/pipeline/LeadDrawer";
import { LeadFormDialog } from "@/components/pipeline/LeadFormDialog";
import { PipelineScrollBar } from "@/components/pipeline/PipelineScrollBar";
import { StagesDialog } from "@/components/pipeline/StagesDialog";
import { TagsDialog } from "@/components/pipeline/TagsDialog";
import { listPipelineTags } from "@/lib/pipeline/tags.functions";
import { CardLayoutDialog } from "@/components/pipeline/CardLayoutDialog";
import { WebhooksDialog } from "@/components/pipeline/WebhooksDialog";
import { WinLeadDialog } from "@/components/pipeline/WinLeadDialog";
import { AutomationsDialog, type AutomationsTab } from "@/components/pipeline/AutomationsDialog";
import { runDueAutomationsNow } from "@/lib/automations/automations.functions";
import type { Lead, PipelineStage } from "@/components/pipeline/types";
import {
  createPipeline, deletePipeline, listPipeline, moveLead, renamePipeline,
  reorderLeads, reorderStages,
} from "@/lib/pipeline/pipeline.functions";
import { cn } from "@/lib/utils";
import { useLeadArrivalAlert } from "@/lib/pipeline/use-lead-arrival";
import { useWorkspace } from "@/hooks/useWorkspace";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline de Leads — Hublynx Core" },
      { name: "description", content: "Funil de leads com rastreamento UTM, histórico da jornada e webhooks para automação." },
      { property: "og:title", content: "Pipeline de Leads — Hublynx Core" },
      { property: "og:description", content: "Funil de leads com rastreamento UTM, histórico da jornada e webhooks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PipelinePage,
});

type PipelineRow = { id: string; name: string };

const COL_PREFIX = "col:";
const colId = (stageId: string) => `${COL_PREFIX}${stageId}`;

/** Ordem manual (position) e, em empate, o lead mais novo primeiro. */
function byManualOrder(a: Lead, b: Lead) {
  const pa = Number(a.position ?? 0);
  const pb = Number(b.position ?? 0);
  if (pa !== pb) return pa - pb;
  return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
}

/**
 * Ao arrastar uma coluna, só colunas contam como destino.
 * Ao arrastar um card, vale o card sob o ponteiro; sem card, a coluna.
 */
const pipelineCollision: CollisionDetection = (args) => {
  const type = args.active.data.current?.type;
  if (type === "column") {
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "column"),
    });
  }
  const hits = pointerWithin(args);
  const leadHit = hits.find((h) => {
    const c = args.droppableContainers.find((d) => d.id === h.id);
    return c?.data.current?.type === "lead";
  });
  if (leadHit) return [leadHit];
  if (hits.length) return hits;
  return closestCorners(args);
};

function PipelinePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPipeline);
  const moveFn = useServerFn(moveLead);
  const reorderLeadsFn = useServerFn(reorderLeads);
  const reorderStagesFn = useServerFn(reorderStages);
  const createPipelineFn = useServerFn(createPipeline);
  const renamePipelineFn = useServerFn(renamePipeline);
  const deletePipelineFn = useServerFn(deletePipeline);

  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [dragging, setDragging] = useState<Lead | null>(null);
  const [draggingStage, setDraggingStage] = useState<PipelineStage | null>(null);
  const [winLead, setWinLead] = useState<Lead | null>(null);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [hooksOpen, setHooksOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [autoTab, setAutoTab] = useState<AutomationsTab | null>(null);
  const [targetStage, setTargetStage] = useState<string | undefined>();
  const [pipeDialog, setPipeDialog] = useState<"new" | "rename" | null>(null);
  const [pipeName, setPipeName] = useState("");

  const { activeOrganizationId, isLoading: wsLoading } = useWorkspace();

  const pipelineKey = ["pipeline", pipelineId ?? "default", activeOrganizationId ?? "none"] as const;
  const { data, isLoading } = useQuery({
    queryKey: pipelineKey,
    queryFn: () =>
      listFn({
        data: {
          ...(pipelineId ? { pipelineId } : {}),
          ...(activeOrganizationId ? { organizationId: activeOrganizationId } : {}),
        },
      }),
    enabled: !wsLoading,
    staleTime: 15_000,
  });

  const pipelines = (data?.pipelines ?? []) as PipelineRow[];
  const current = (data?.pipeline ?? null) as PipelineRow | null;

  const tagsFn = useServerFn(listPipelineTags);
  const { data: tagsData } = useQuery({
    queryKey: ["pipeline-tags", current?.id ?? "none"],
    queryFn: () => tagsFn({ data: { pipelineId: current!.id } }),
    enabled: !!current?.id,
    staleTime: 60_000,
  });
  const tags = useMemo(
    () => (tagsData?.tags ?? []).filter((t) => t.active !== false),
    [tagsData],
  );

  const stages = (data?.stages ?? []) as PipelineStage[];

  // Automações por tempo ("X dias na etapa"): confere ao abrir o Pipeline (no máximo a cada 5 min).
  const runDueFn = useServerFn(runDueAutomationsNow);
  useEffect(() => {
    if (!activeOrganizationId) return;
    const key = `core_auto_due_${activeOrganizationId}`;
    let last = 0;
    try { last = Number(localStorage.getItem(key) ?? 0); } catch { /* sem armazenamento */ }
    if (Date.now() - last < 5 * 60_000) return;
    try { localStorage.setItem(key, String(Date.now())); } catch { /* sem armazenamento */ }
    runDueFn({ data: { organizationId: activeOrganizationId } })
      .then((r: any) => { if (r?.ran) qc.invalidateQueries({ queryKey: ["pipeline"] }); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganizationId]);
  const leads = useMemo(
    () =>
      [...((data?.leads ?? []) as Lead[])].sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      ),
    [data?.leads],
  );

  useLeadArrivalAlert(leads);


  const refresh = () => qc.invalidateQueries({ queryKey: ["pipeline"] });

  const savePipeline = useMutation({
    mutationFn: async () => {
      const name = pipeName.trim();
      if (!name) throw new Error("Informe um nome.");
      if (pipeDialog === "rename" && current) {
        await renamePipelineFn({ data: { id: current.id, name } });
        return current.id;
      }
      const row = await createPipelineFn({ data: { name } });
      return row.id as string;
    },
    onSuccess: (id) => {
      setPipelineId(id);
      setPipeDialog(null);
      refresh();
      toast.success("Pipeline salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePipeline = useMutation({
    mutationFn: (id: string) => deletePipelineFn({ data: { id } }),
    onSuccess: () => {
      setPipelineId(undefined);
      refresh();
      toast.success("Pipeline removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((l) =>
      [l.name, l.company, l.email, l.phone, l.utm_campaign, l.source]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [leads, q]);

  const total = filtered.reduce((s, l) => s + Number(l.value ?? 0), 0);

  // Lista de cada etapa na ordem em que aparece na tela.
  const leadsOf = (stageId: string, list: Lead[] = filtered) =>
    list.filter((l) => l.stage_id === stageId).sort(byManualOrder);

  type PipelineData = { stages: PipelineStage[]; leads: Lead[] } & Record<string, unknown>;
  const patchCache = (fn: (d: PipelineData) => PipelineData) =>
    qc.setQueryData<PipelineData>(pipelineKey as unknown as unknown[], (old) => (old ? fn(old) : old));

  const arrange = useMutation({
    mutationFn: async (v: {
      leadId: string;
      fromStage: string | null;
      toStage: string;
      ordered: string[];
      before: Map<string, number>;
    }) => {
      const idx = v.ordered.indexOf(v.leadId);
      if (v.fromStage !== v.toStage) {
        await moveFn({ data: { id: v.leadId, stage_id: v.toStage, position: idx } });
      }
      const items = v.ordered
        .map((id, position) => ({ id, position }))
        .filter((it) => it.id !== v.leadId || v.fromStage === v.toStage)
        .filter((it) => v.before.get(it.id) !== it.position);
      if (items.length) await reorderLeadsFn({ data: { stage_id: v.toStage, items } });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      refresh();
    },
    onSettled: refresh,
  });

  const arrangeStages = useMutation({
    mutationFn: (ids: string[]) => reorderStagesFn({ data: { ids } }),
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });

  // Mouse arrasta após 6px; no toque é preciso segurar o card para arrastar,
  // assim o deslizar lateral continua rolando as etapas no celular.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const columnRefs = useRef(new Map<string, HTMLDivElement>());

  // Rolagem lateral com o mouse: clicar no fundo do quadro, segurar e arrastar.
  // Cards, alças de coluna, botões e campos continuam com o comportamento normal.
  const boardRef = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  const onBoardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = boardRef.current;
    if (!el || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-lead-card], button, a, input, textarea, select, [role='button'], [data-no-pan]")) return;
    e.preventDefault();
    const startX = e.pageX;
    const startScroll = el.scrollLeft;
    setPanning(true);
    const onMove = (ev: MouseEvent) => {
      el.scrollLeft = startScroll - (ev.pageX - startX);
    };
    const onUp = () => {
      setPanning(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const scrollToStage = (id: string) =>
    columnRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });

  function onDragStart(e: DragStartEvent) {
    if (e.active.data.current?.type === "column") {
      setDraggingStage(stages.find((st) => colId(st.id) === e.active.id) ?? null);
      return;
    }
    setDragging(leads.find((l) => l.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    setDraggingStage(null);
    const { active, over } = e;
    if (!over) return;

    // 1) Reordenar colunas (etapas) pelo cabeçalho
    if (active.data.current?.type === "column") {
      const from = stages.findIndex((st) => colId(st.id) === active.id);
      const to = stages.findIndex((st) => colId(st.id) === over.id);
      if (from < 0 || to < 0 || from === to) return;
      const next = arrayMove(stages, from, to).map((st, i) => ({ ...st, position: i }));
      patchCache((d) => ({ ...d, stages: next }));
      arrangeStages.mutate(next.map((st) => st.id));
      return;
    }

    // 2) Mover / reordenar card
    const lead = leads.find((l) => l.id === active.id);
    if (!lead) return;
    const overData = over.data.current as { type?: string; stageId?: string | null } | undefined;
    const toStage =
      overData?.type === "lead"
        ? overData.stageId ?? null
        : overData?.type === "column"
          ? overData.stageId ?? null
          : null;
    if (!toStage) return;
    if (over.id === active.id) return;

    const fromStage = lead.stage_id ?? null;
    const target = stages.find((st) => st.id === toStage);
    // A ordem é calculada sobre a lista completa da etapa (sem o filtro de busca)
    const column = leadsOf(toStage, leads);
    const before = new Map(column.map((l, i) => [l.id, i]));
    let ordered = column.map((l) => l.id);
    if (fromStage === toStage) {
      const oldIdx = ordered.indexOf(lead.id);
      const newIdx = overData?.type === "lead" ? ordered.indexOf(String(over.id)) : ordered.length - 1;
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      ordered = arrayMove(ordered, oldIdx, newIdx);
    } else {
      const at = overData?.type === "lead" ? ordered.indexOf(String(over.id)) : ordered.length;
      ordered.splice(at < 0 ? ordered.length : at, 0, lead.id);
    }

    // Atualiza a tela na hora; o servidor confirma em seguida
    const pos = new Map(ordered.map((id, i) => [id, i]));
    patchCache((d) => ({
      ...d,
      leads: d.leads.map((l) =>
        pos.has(l.id)
          ? ({ ...l, stage_id: toStage, position: pos.get(l.id)! } as Lead)
          : l,
      ),
    }));
    arrange.mutate({ leadId: lead.id, fromStage, toStage, ordered, before });

    // modal de conversão Ganho → Cliente → Projeto
    if (fromStage !== toStage && target?.is_won && !(lead as any).converted_project_id) {
      setWinLead({ ...lead, stage_id: toStage });
    }
  }

  function openNew(stageId?: string) {
    setEditing(null);
    setTargetStage(stageId);
    setFormOpen(true);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Pipeline de Vendas</h1>
            <Select
              value={current?.id ?? ""}
              onValueChange={(v) => {
                if (v === "__new__") {
                  setPipeName("");
                  setPipeDialog("new");
                  return;
                }
                setPipelineId(v);
              }}
            >
              <SelectTrigger className="h-9 w-full sm:h-8 sm:w-[220px]">
                <SelectValue placeholder="Selecionar pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
                <SelectItem value="__new__">+ Novo pipeline</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.length} leads · {currency(total)} em negociação
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 lg:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar lead, campanha..."
              className="w-full pl-9 lg:w-56"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 shrink-0 sm:h-8" aria-label="Configurações">
                <Settings className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Configurações</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Pipeline</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => { setPipeName(""); setPipeDialog("new"); }}>
                <Plus className="mr-2 h-4 w-4" /> Novo pipeline
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!current}
                onSelect={() => { setPipeName(current?.name ?? ""); setPipeDialog("rename"); }}
              >
                <Pencil className="mr-2 h-4 w-4" /> Renomear pipeline
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={!current || pipelines.length < 2}
                onSelect={() => current && removePipeline.mutate(current.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Excluir pipeline
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Configurar funil</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setStagesOpen(true)}>
                <Settings2 className="mr-2 h-4 w-4" /> Etapas
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLayoutOpen(true)}>
                <LayoutTemplate className="mr-2 h-4 w-4" /> Layout do card
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!current} onSelect={() => setTagsOpen(true)}>
                <Tags className="mr-2 h-4 w-4" /> Tags de conversão
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setHooksOpen(true)}>
                <Webhook className="mr-2 h-4 w-4" /> Webhooks
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Automação</DropdownMenuLabel>
              <DropdownMenuItem disabled={!current} onSelect={() => setAutoTab("automacoes")}>
                <Zap className="mr-2 h-4 w-4" /> Automações do Kanban
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAutoTab("emails")}>
                <Mail className="mr-2 h-4 w-4" /> Modelos de e-mail
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Integrações</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/configuracoes/integracoes">
                  <Mail className="mr-2 h-4 w-4" /> Gmail
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/configuracoes/integracoes">
                  <CalendarDays className="mr-2 h-4 w-4" /> Google Calendar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/configuracoes/integracoes">
                  <HardDrive className="mr-2 h-4 w-4" /> Google Drive
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" className="h-9 shrink-0 sm:h-8" onClick={() => openNew(stages[0]?.id)} aria-label="Novo lead">
            <Plus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Novo lead</span>
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden sm:gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80 w-[85vw] max-w-72 shrink-0 rounded-xl sm:w-72" />)}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pipelineCollision}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          {/* Celular: atalhos das etapas para pular direto à coluna */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden">
            {stages.map((stage) => {
              const n = filtered.filter((l) => l.stage_id === stage.id).length;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => scrollToStage(stage.id)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="max-w-[9rem] truncate">{stage.name}</span>
                  <span className="text-muted-foreground tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
          <SortableContext items={stages.map((st) => colId(st.id))} strategy={horizontalListSortingStrategy}>
          <div
            ref={boardRef}
            onMouseDown={onBoardMouseDown}
            className={cn(
              "-mx-4 flex flex-1 snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-20 md:mx-0 md:snap-none md:gap-4 md:px-0",
              "md:cursor-grab [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
              panning && "select-none md:cursor-grabbing",
            )}
          >
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                columnRef={(el) => {
                  if (el) columnRefs.current.set(stage.id, el);
                  else columnRefs.current.delete(stage.id);
                }}
                stage={stage}
                leads={leadsOf(stage.id)}
                onOpen={setOpenLead}
                onEdit={(l) => { setEditing(l); setTargetStage(undefined); setFormOpen(true); }}
                onAdd={() => openNew(stage.id)}
                locked={!!stage.is_won || !!stage.is_lost}
                tags={tags}
              />
            ))}
          </div>
          </SortableContext>
          <PipelineScrollBar key={`${current?.id ?? "none"}:${stages.length}`} boardRef={boardRef} />
          <DragOverlay>
            {dragging && (
              <div className="w-[85vw] max-w-72 rotate-2 sm:w-72">
                <LeadCard lead={dragging} onOpen={() => {}} onEdit={() => {}} draggable={false} overlay tags={tags} />
              </div>
            )}
            {draggingStage && (
              <div className="w-[85vw] max-w-72 rotate-1 rounded-xl border bg-card shadow-lg sm:w-72">
                <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: draggingStage.color }} />
                <p className="px-3 py-2.5 text-sm font-semibold">{draggingStage.name}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog open={pipeDialog !== null} onOpenChange={(v) => !v && setPipeDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{pipeDialog === "rename" ? "Renomear pipeline" : "Novo pipeline"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={pipeName}
              onChange={(e) => setPipeName(e.target.value)}
              placeholder="Ex.: Tráfego pago"
              onKeyDown={(e) => e.key === "Enter" && savePipeline.mutate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPipeDialog(null)}>Cancelar</Button>
            <Button disabled={savePipeline.isPending} onClick={() => savePipeline.mutate()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        stages={stages}
        lead={editing}
        defaultStageId={targetStage}
        tags={tags}
      />
      <TagsDialog open={tagsOpen} onOpenChange={setTagsOpen} pipelineId={current?.id} />
      <StagesDialog
        open={stagesOpen}
        onOpenChange={setStagesOpen}
        stages={stages}
        pipelineId={current?.id}
      />
      <CardLayoutDialog open={layoutOpen} onOpenChange={setLayoutOpen} />
      <WebhooksDialog open={hooksOpen} onOpenChange={setHooksOpen} stages={stages} />
      <WinLeadDialog lead={winLead} onOpenChange={(v) => !v && setWinLead(null)} />
      <AutomationsDialog
        open={!!autoTab}
        onOpenChange={(v) => !v && setAutoTab(null)}
        initialTab={autoTab ?? "automacoes"}
        pipeline={current}
        stages={stages}
        tags={tags.map((t) => ({ slug: t.slug, name: t.name, color: t.color }))}
        organizationId={activeOrganizationId ?? null}
      />

      <LeadDrawer
        lead={openLead}
        stages={stages}
        tags={tags}
        onOpenChange={(v) => !v && setOpenLead(null)}
        onEdit={(l) => { setOpenLead(null); setEditing(l); setFormOpen(true); }}
        onConfigureTags={() => setTagsOpen(true)}
        onWin={(l) => setWinLead(l)}
      />
    </div>
  );
}

function StageColumn({
  stage,
  leads,
  onOpen,
  onEdit,
  onAdd,
  locked = false,
  tags = [],
  columnRef,
}: {
  columnRef?: (el: HTMLDivElement | null) => void;
  stage: PipelineStage;
  leads: Lead[];
  onOpen: (l: Lead) => void;
  onEdit: (l: Lead) => void;
  onAdd: () => void;
  locked?: boolean;
  tags?: { slug: string; name: string; color: string }[];
}) {
  // A coluna é ordenável pelo cabeçalho e também recebe cards soltos nela.
  const {
    setNodeRef, isOver, attributes, listeners, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id: colId(stage.id), data: { type: "column", stageId: stage.id } });
  const setRefs = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    columnRef?.(el);
  };
  const total = leads.reduce((s, l) => s + Number(l.value ?? 0), 0);

  return (
    <div
      ref={setRefs}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex w-[85vw] max-w-72 shrink-0 snap-start flex-col rounded-xl border bg-muted/30 transition sm:w-72",
        isOver && "border-primary/60 bg-primary/5",
        locked && "border-dashed",
        isDragging && "opacity-40",
      )}
    >
      <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: stage.color }} />
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="-ml-1 flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent active:cursor-grabbing"
          aria-label={`Arrastar etapa ${stage.name}`}
          title="Segure e arraste para reordenar a etapa"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {stage.name}
            {locked && (
              <span title="Etapa final — leads não podem ser movidos">
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {leads.length} leads {total > 0 && `· ${currency(total)}`}
            {locked && " · etapa final"}
          </p>
        </div>
        {!locked && (
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-7 sm:w-7" onClick={onAdd} aria-label={`Novo lead em ${stage.name}`}>
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        {leads.map((l) => (
          <LeadCard
            key={l.id}
            lead={l}
            onOpen={onOpen}
            onEdit={onEdit}
            draggable={!locked}
            locked={locked}
            tags={tags}
            onLockedDrag={() =>
              toast.info(
                stage.is_won
                  ? "Lead já convertido em venda ganha — não pode ser movido."
                  : "Lead desqualificado — não pode ser movido.",
              )
            }
          />
        ))}
        {leads.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            <span className="md:hidden">Nenhum lead nesta etapa</span>
            <span className="hidden md:inline">Arraste leads para cá</span>
          </p>
        )}
      </div>
      </SortableContext>
    </div>
  );
}
