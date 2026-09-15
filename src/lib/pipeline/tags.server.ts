import type { PipelineTag } from "./tags";
import { normalizeTags } from "./tags";

const keyFor = (pipelineId: string) => `pipeline_tags:${pipelineId}`;

export async function readPipelineTags(pipelineId: string): Promise<PipelineTag[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_config")
    .select("value")
    .eq("key", keyFor(pipelineId))
    .maybeSingle();
  if (error) console.error("[pipeline-tags] leitura falhou:", error.message);
  const raw = (data?.value as { tags?: unknown } | null)?.tags;
  return normalizeTags(raw);
}

export async function writePipelineTags(pipelineId: string, tags: PipelineTag[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("app_config")
    .upsert(
      { key: keyFor(pipelineId), value: { tags } as never, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(error.message);
}
