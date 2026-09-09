import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeTags, slugifyTag, type PipelineTag } from "./tags";

const uuid = z.string().uuid();

const tagSchema = z.object({
  slug: z.string().max(40).optional(),
  name: z.string().min(1).max(40),
  color: z.string().max(20),
  funnel_key: z.string().max(20),
  active: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

async function assertPipelineAccess(supabase: any, pipelineId: string) {
  const { data } = await supabase.from("pipelines").select("id").eq("id", pipelineId).maybeSingle();
  if (!data) throw new Error("Pipeline não encontrado.");
}

export const listPipelineTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pipelineId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertPipelineAccess(context.supabase, data.pipelineId);
    const { readPipelineTags } = await import("./tags.server");
    return { tags: await readPipelineTags(data.pipelineId) };
  });

export const savePipelineTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ pipelineId: uuid, tags: z.array(tagSchema).max(60) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPipelineAccess(context.supabase, data.pipelineId);
    const cleaned = normalizeTags(
      data.tags.map((t, i) => ({
        ...t,
        slug: t.slug || slugifyTag(t.name),
        position: t.position ?? i,
      })),
    );
    // remove slugs duplicados mantendo o primeiro
    const seen = new Set<string>();
    const tags: PipelineTag[] = cleaned.filter((t) =>
      seen.has(t.slug) ? false : (seen.add(t.slug), true),
    );
    const { writePipelineTags } = await import("./tags.server");
    await writePipelineTags(data.pipelineId, tags);
    return { tags };
  });

export const setLeadTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: uuid, tags: z.array(z.string().max(40)).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ tags: data.tags })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true as const, tags: data.tags };
  });
