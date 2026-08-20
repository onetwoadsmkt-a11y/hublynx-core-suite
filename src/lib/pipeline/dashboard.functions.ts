import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export const pipelineDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        pipelineId: uuid.optional(),
        from: z.string().optional(),
        to: z.string().optional(),
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

    let leads: {
      id: string;
      stage_id: string | null;
      value: number | null;
      source: string | null;
      created_at: string;
      temperature: string | null;
    }[] = [];

    if (stageIds.length > 0) {
      const isFirst = current && list[0] && current.id === list[0].id;
      let q = supabase
        .from("leads")
        .select("id,stage_id,value,source,created_at,temperature");
      q = isFirst
        ? q.or(`stage_id.in.(${stageIds.join(",")}),stage_id.is.null`)
        : q.in("stage_id", stageIds);
      if (data.from) q = q.gte("created_at", `${data.from}T00:00:00`);
      if (data.to) q = q.lte("created_at", `${data.to}T23:59:59`);
      const { data: rows, error } = await q.order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      leads = (rows ?? []) as typeof leads;
    }

    return { pipelines: list, pipeline: current, stages: stages ?? [], leads };
  });
