// Server-only: objetivos do funil guardados por pipeline em app_config (como as tags).
import { normalizeGoals } from "./funnel-goals";

export async function readFunnelGoals(pipelineId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_config").select("value").eq("key", `funnel_goals:${pipelineId}`).maybeSingle();
  return normalizeGoals(data?.value ?? null);
}
