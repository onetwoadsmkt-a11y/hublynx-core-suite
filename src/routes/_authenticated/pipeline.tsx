import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { LayoutTemplate, Plus, Search, Settings2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadCard, currency } from "@/components/pipeline/LeadCard";
import { LeadDrawer } from "@/components/pipeline/LeadDrawer";
import { LeadFormDialog } from "@/components/pipeline/LeadFormDialog";
import { StagesDialog } from "@/components/pipeline/StagesDialog";
import { CardLayoutDialog } from "@/components/pipeline/CardLayoutDialog";
import { WebhooksDialog } from "@/components/pipeline/WebhooksDialog";
import type { Lead, PipelineStage } from "@/components/pipeline/types";
import { listPipeline, moveLead } from "@/lib/pipeline/pipeline.functions";
import { cn } from "@/lib/utils";

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

function PipelinePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPipeline);
  const moveFn = useServerFn(moveLead);

  const [q, setQ] = useState("");
  const [dragging, setDragging] = useState<Lead | null>(null);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [hooksOpen, setHooksOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [targetStage, setTargetStage] = useState<string | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ["pipeline"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const stages = (data?.stages ?? []) as PipelineStage[];
  const leads = (data?.leads ?? []) as Lead[];

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragStart(e: DragStartEvent) {
    setDragging(leads.find((l) => l.id === e.active.id) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const stageId = e.over?.id ? String(e.over.id) : null;
    const lead = leads.find((l) => l.id === e.active.id);
    if (!stageId || !lead || lead.stage_id === stageId) return;
    move.mutate({ id: lead.id, stage_id: stageId });
  }

  function openNew(stageId?: string) {
    setEditing(null);
    setTargetStage(stageId);
    setFormOpen(true);
  }

  return (
    <div className="flex h-full flex-col gap-4 bg-gradient-to-b from-[#071A3D] to-[#0F4C5C] p-4 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Pipeline</h1>
          <p className="text-sm text-white/70">
            {filtered.length} leads · {currency(total)} em negociação
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar lead, campanha..."
              className="w-56 border-white/10 bg-white/10 pl-9 text-white placeholder:text-white/50"
            />
          </div>
          <Button variant="outline" size="sm" className="border-white/10 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => setStagesOpen(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" /> Etapas
          </Button>
          <Button variant="outline" size="sm" className="border-white/10 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => setLayoutOpen(true)}>
            <LayoutTemplate className="mr-1.5 h-4 w-4" /> Layout do card
          </Button>
          <Button variant="outline" size="sm" className="border-white/10 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => setHooksOpen(true)}>
            <Webhook className="mr-1.5 h-4 w-4" /> Webhooks
          </Button>
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

      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        stages={stages}
        lead={editing}
        defaultStageId={targetStage}
      />
      <StagesDialog open={stagesOpen} onOpenChange={setStagesOpen} stages={stages} />
      <CardLayoutDialog open={layoutOpen} onOpenChange={setLayoutOpen} />
      <WebhooksDialog open={hooksOpen} onOpenChange={setHooksOpen} stages={stages} />
      <LeadDrawer
        lead={openLead}
        stages={stages}
        onOpenChange={(v) => !v && setOpenLead(null)}
        onEdit={(l) => { setOpenLead(null); setEditing(l); setFormOpen(true); }}
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
}: {
  stage: PipelineStage;
  leads: Lead[];
  onOpen: (l: Lead) => void;
  onEdit: (l: Lead) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = leads.reduce((s, l) => s + Number(l.value ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border border-white/10 bg-white/10 transition",
        isOver && "border-primary/60 bg-primary/10",
      )}
    >
      <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: stage.color }} />
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{stage.name}</p>
          <p className="text-[11px] text-white/70">
            {leads.length} leads {total > 0 && `· ${currency(total)}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/10 hover:text-white" onClick={onAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        {leads.map((l) => (
          <LeadCard key={l.id} lead={l} onOpen={onOpen} onEdit={onEdit} />
        ))}
        {leads.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-white/60">Arraste leads para cá</p>
        )}
      </div>
    </div>
  );
}
