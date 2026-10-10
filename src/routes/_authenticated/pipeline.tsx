import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, closestCorners, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import {
  CalendarDays, HardDrive, LayoutTemplate, Lock, Mail, Pencil, Plus, Search, Settings, Settings2, Tags, Trash2, Webhook,
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
import { StagesDialog } from "@/components/pipeline/StagesDialog";
import { TagsDialog } from "@/components/pipeline/TagsDialog";
import { listPipelineTags } from "@/lib/pipeline/tags.functions";
import { CardLayoutDialog } from "@/components/pipeline/CardLayoutDialog";
import { WebhooksDialog } from "@/components/pipeline/WebhooksDialog";
import { WinLeadDialog } from "@/components/pipeline/WinLeadDialog";
import type { Lead, PipelineStage } from "@/components/pipeline/types";
import {
  createPipeline, deletePipeline, listPipeline, moveLead, renamePipeline,
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

function PipelinePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPipeline);
  const moveFn = useServerFn(moveLead);
  const createPipelineFn = useServerFn(createPipeline);
  const renamePipelineFn = useServerFn(renamePipeline);
  const deletePipelineFn = useServerFn(deletePipeline);

  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [dragging, setDragging] = useState<Lead | null>(null);
  const [winLead, setWinLead] = useState<Lead | null>(null);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [hooksOpen, setHooksOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [targetStage, setTargetStage] = useState<string | undefined>();
  const [pipeDialog, setPipeDialog] = useState<"new" | "rename" | null>(null);
  const [pipeName, setPipeName] = useState("");

  const { activeOrganizationId, isLoading: wsLoading } = useWorkspace();

  const { data, isLoading } = useQuery({
    queryKey: ["pipeline", pipelineId ?? "default", activeOrganizationId ?? "none"],
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

  const move = useMutation({
    mutationFn: (v: { id: string; stage_id: string }) => moveFn({ data: v }),
    onSuccess: refresh,
  });

  // Mouse arrasta após 6px; no toque é preciso segurar o card para arrastar,
  // assim o deslizar lateral continua rolando as etapas no celular.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const columnRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollToStage = (id: string) =>
    columnRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });

  // modal de conversão Ganho → Cliente → Projeto → Financeiro
  function onDragStart(e: DragStartEvent) {
    setDragging(leads.find((l) => l.id === e.active.id) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const stageId = e.over?.id ? String(e.over.id) : null;
    const lead = leads.find((l) => l.id === e.active.id);
    if (!stageId || !lead || lead.stage_id === stageId) return;
    const target = stages.find((st) => st.id === stageId);
    if (target?.is_won && !(lead as any).converted_project_id) {
      move.mutate({ id: lead.id, stage_id: stageId });
      setWinLead({ ...lead, stage_id: stageId });
      return;
    }
    move.mutate({ id: lead.id, stage_id: stageId });
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
          collisionDetection={closestCorners}
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
          <div className="-mx-4 flex flex-1 snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:snap-none md:gap-4 md:px-0">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                columnRef={(el) => {
                  if (el) columnRefs.current.set(stage.id, el);
                  else columnRefs.current.delete(stage.id);
                }}
                stage={stage}
                leads={filtered.filter((l) => l.stage_id === stage.id)}
                onOpen={setOpenLead}
                onEdit={(l) => { setEditing(l); setTargetStage(undefined); setFormOpen(true); }}
                onAdd={() => openNew(stage.id)}
                locked={!!stage.is_won || !!stage.is_lost}
                tags={tags}
              />
            ))}
          </div>
          <DragOverlay>
            {dragging && (
              <div className="w-[85vw] max-w-72 rotate-2 sm:w-72">
                <LeadCard lead={dragging} onOpen={() => {}} onEdit={() => {}} draggable={false} />
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
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const setRefs = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    columnRef?.(el);
  };
  const total = leads.reduce((s, l) => s + Number(l.value ?? 0), 0);

  return (
    <div
      ref={setRefs}
      className={cn(
        "flex w-[85vw] max-w-72 shrink-0 snap-start flex-col rounded-xl border bg-muted/30 transition sm:w-72",
        isOver && "border-primary/60 bg-primary/5",
        locked && "border-dashed",
      )}
    >
      <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: stage.color }} />
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
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
    </div>
  );
}
