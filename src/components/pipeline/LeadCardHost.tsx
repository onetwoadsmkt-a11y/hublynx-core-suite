import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { listPipelineTags } from "@/lib/pipeline/tags.functions";
import { LeadDrawer } from "./LeadDrawer";
import { WinLeadDialog } from "./WinLeadDialog";
import { useState } from "react";
import type { Lead } from "./types";
import { cn } from "@/lib/utils";

// Estado global mínimo: qual lead está aberto por cima da tela atual.
let openLeadId: string | null = null;
const listeners = new Set<() => void>();
function setOpenLead(id: string | null) {
  openLeadId = id;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Abre o cartão do lead (o mesmo do Pipeline) sem sair da tela atual. */
export function openLeadCard(leadId: string) {
  setOpenLead(leadId);
}

/** Nome do lead como link que abre o cartão dele. */
export function LeadLink({
  leadId, name, className, prefix = "Lead · ",
}: { leadId: string; name: string; className?: string; prefix?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openLeadCard(leadId); }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn("inline-flex min-w-0 items-center truncate text-primary underline-offset-2 hover:underline", className)}
      title={`Abrir cartão do lead ${name}`}
    >
      <span className="truncate">{prefix}{name}</span>
    </button>
  );
}

/** Montado uma vez no AppShell. */
export function LeadCardHost() {
  const leadId = useSyncExternalStore(subscribe, () => openLeadId, () => null);
  const navigate = useNavigate();
  const tagsFn = useServerFn(listPipelineTags);

  const { data: lead } = useQuery({
    queryKey: ["lead-card", leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", leadId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Lead | null;
    },
    enabled: !!leadId,
    staleTime: 30_000,
  });

  const { data: stage } = useQuery({
    queryKey: ["lead-card-stage", lead?.stage_id],
    queryFn: async () => {
      const { data } = await supabase.from("pipeline_stages").select("*").eq("id", lead!.stage_id!).maybeSingle();
      return data ?? null;
    },
    enabled: !!lead?.stage_id,
    staleTime: 60_000,
  });

  const pipelineId = (stage as any)?.pipeline_id as string | undefined;
  const { data: tagsData } = useQuery({
    queryKey: ["pipeline-tags", pipelineId ?? "none"],
    queryFn: () => tagsFn({ data: { pipelineId: pipelineId! } }),
    enabled: !!pipelineId,
    staleTime: 60_000,
  });
  const tags = (tagsData?.tags ?? []).filter((t: any) => t.active !== false);
  const [winLead, setWinLead] = useState<Lead | null>(null);

  return (
    <>
    <WinLeadDialog lead={winLead} onOpenChange={(v) => !v && setWinLead(null)} />
    <LeadDrawer
      lead={leadId && lead ? lead : null}
      stages={stage ? [stage as any] : []}
      tags={tags as any}
      onOpenChange={(v) => { if (!v) setOpenLead(null); }}
      onEdit={() => { setOpenLead(null); navigate({ to: "/pipeline" }); }}
      onWin={(l) => setWinLead(l)}
    />
    </>
  );
}
