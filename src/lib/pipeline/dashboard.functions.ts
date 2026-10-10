import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scopeOrganization } from "@/lib/org/filter";
import { classifyStage } from "./funnel";

const uuid = z.string().uuid();

export const pipelineDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        pipelineId: uuid.optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        organizationId: uuid.optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: pipelines } = await supabase
      .from("pipelines")
      .select("id,name")
      .order("position");

    const list = pipelines ?? [];
    const current = list.find((p) => p.id === data.pipelineId) ?? list[0] ?? null;

    const { data: stages } = current
      ? await supabase
          .from("pipeline_stages")
          .select("id,name,color,position,is_won,is_lost")
          .eq("pipeline_id", current.id)
          .order("position")
      : { data: [] as never[] };

    const stageIds = (stages ?? []).map((s) => s.id);

    type Row = {
      id: string;
      stage_id: string | null;
      value: number | null;
      source: string | null;
      created_at: string;
      temperature: string | null;
      tags: string[] | null;
      lead_classification: string | null;
      converted_at: string | null;
      updated_at: string;
    };

    let leads: Row[] = [];
    let previousLeads: Row[] = [];

    const isFirst = current && list[0] && current.id === list[0].id;

    const fetchRange = async (fromDay?: string, toDay?: string) => {
      if (stageIds.length === 0) return [] as Row[];
      let q = scopeOrganization(
        supabase
          .from("leads")
          .select(
            "id,stage_id,value,source,created_at,temperature,tags,lead_classification,converted_at,updated_at",
          ),
        data.organizationId,
      );
      q = isFirst
        ? q.or(`stage_id.in.(${stageIds.join(",")}),stage_id.is.null`)
        : q.in("stage_id", stageIds);
      if (fromDay) q = q.gte("created_at", `${fromDay}T00:00:00`);
      if (toDay) q = q.lte("created_at", `${toDay}T23:59:59`);
      const { data: rows, error } = await q
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw new Error(error.message);
      return (rows ?? []) as unknown as Row[];
    };

    leads = await fetchRange(data.from, data.to);

    // Período anterior de mesma duração, para comparação
    if (data.from && data.to) {
      const start = new Date(`${data.from}T00:00:00Z`);
      const end = new Date(`${data.to}T00:00:00Z`);
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      const prevEnd = new Date(start.getTime() - 86400000);
      const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      previousLeads = await fetchRange(iso(prevStart), iso(prevEnd));
    }

    // Todos os leads atualmente no pipeline (sem filtro de data)
    const allLeads = await fetchRange();

    // Quando cada lead entrou numa etapa de ganho (histórico gravado pelo gatilho de etapa).
    // Usado no gráfico de evolução e nos ganhos fechados no período.
    const wonStageIds = (stages ?? []).filter((s) => classifyStage(s) === "ganho").map((s) => s.id);
    let winEvents: { lead_id: string; created_at: string }[] = [];
    if (wonStageIds.length > 0) {
      const since = new Date(Date.now() - 400 * 86400000).toISOString();
      const { data: ev } = await supabase
        .from("lead_events")
        .select("lead_id,created_at")
        .eq("kind", "stage_changed")
        .in("meta->>to", wonStageIds)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(5000);
      winEvents = (ev ?? []) as { lead_id: string; created_at: string }[];
    }

    let tags: Awaited<ReturnType<typeof import("./tags.server").readPipelineTags>> = [];
    if (current) {
      const { readPipelineTags } = await import("./tags.server");
      tags = await readPipelineTags(current.id);
    }

    return {
      pipelines: list,
      pipeline: current,
      stages: stages ?? [],
      tags,
      leads,
      previousLeads,
      allLeads,
      winEvents,
    };
  });

