import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors,
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Pipeline de Vendas</h1>
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
              <SelectTrigger className="h-8 w-[220px]">
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
          <p className="text-sm text-muted-foreground">
            {filtered.length} leads · {currency(total)} em negociação
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar lead, campanha..."
              className="w-56 pl-9"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="mr-1.5 h-4 w-4" /> Configurações
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

          <Button size="sm" onClick={() => openNew(stages[0]?.id)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo lead
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80 w-72 rounded-xl" />)}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
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
              <div className="w-72 rotate-2">
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
}: {
  stage: PipelineStage;
  leads: Lead[];
  onOpen: (l: Lead) => void;
  onEdit: (l: Lead) => void;
  onAdd: () => void;
  locked?: boolean;
  tags?: { slug: string; name: string; color: string }[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = leads.reduce((s, l) => s + Number(l.value ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30 transition",
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
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAdd}>
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
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Arraste leads para cá</p>
        )}
      </div>
    </div>
  );
}
