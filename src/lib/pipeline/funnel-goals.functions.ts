import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeGoals, STEPS } from "./funnel-goals";

const uuid = z.string().uuid();
const keyFor = (pipelineId: string) => `funnel_goals:${pipelineId}`;

async function assertAccess(supabase: any, pipelineId: string) {
  const { data } = await supabase.from("pipelines").select("id").eq("id", pipelineId).maybeSingle();
  if (!data) throw new Error("Pipeline não encontrado ou sem permissão.");
}

export const getFunnelGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pipelineId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.pipelineId);
    const { readFunnelGoals } = await import("./funnel-goals.server");
    return readFunnelGoals(data.pipelineId);
  });

const role = z.enum([...STEPS, "perdido", "noshow", "nutricao", "ignorar"]);
const pct = z.number().min(0).max(100);

export const saveFunnelGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      pipelineId: uuid,
      goals: z.object({
        objective: z.enum(["conectado", "agendada", "realizada", "cof", "ganho"]),
        stageMap: z.record(uuid, role),
        useTags: z.boolean(),
        useHistory: z.boolean(),
        labels: z.record(z.enum(STEPS), z.string().max(40)),
        targets: z.object({
          leads: z.number().int().min(0).max(1_000_000).nullable(),
          conversion: pct.nullable(),
          steps: z.record(z.enum(STEPS), pct),
        }),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.pipelineId);
    // Só etapas deste pipeline entram no mapa.
    const { data: stages } = await context.supabase.from("pipeline_stages").select("id").eq("pipeline_id", data.pipelineId);
    const valid = new Set((stages ?? []).map((s: any) => s.id as string));
    const goals = normalizeGoals({
      ...data.goals,
      stageMap: Object.fromEntries(Object.entries(data.goals.stageMap).filter(([id]) => valid.has(id))),
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_config")
      .upsert({ key: keyFor(data.pipelineId), value: goals as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return goals;
  });
