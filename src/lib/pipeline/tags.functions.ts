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
    const { supabase, userId } = context as any;

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, owner_id, stage_id, tags")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Lead não encontrado.");

    const before = ((lead?.tags as string[] | null) ?? []).map(String);

    const { error } = await supabase
      .from("leads")
      .update({ tags: data.tags })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);

    // registra no histórico da jornada
    const lower = (a: string[]) => a.map((s) => s.toLowerCase());
    const added = data.tags.filter((t) => !lower(before).includes(t.toLowerCase()));
    const removed = before.filter((t) => !lower(data.tags).includes(t.toLowerCase()));

    if (added.length || removed.length) {
      let labels: Record<string, string> = {};
      try {
        if (lead.pipeline_id) {
          const { readPipelineTags } = await import("./tags.server");
          const cfg = await readPipelineTags(lead.pipeline_id);
          labels = Object.fromEntries(cfg.map((t) => [t.slug.toLowerCase(), t.name]));
        }
      } catch { /* sem configuração de tags */ }
      const label = (s: string) => labels[s.toLowerCase()] ?? s;

      const rows = [
        ...added.map((t) => ({
          lead_id: data.leadId,
          owner_id: userId,
          actor_id: userId,
          kind: "tag_added",
          title: `Tag adicionada: ${label(t)}`,
          description: null,
          meta: { tag: t },
        })),
        ...removed.map((t) => ({
          lead_id: data.leadId,
          owner_id: userId,
          actor_id: userId,
          kind: "tag_removed",
          title: `Tag removida: ${label(t)}`,
          description: null,
          meta: { tag: t },
        })),
      ];
      const { error: eventError } = await supabase.from("lead_events").insert(rows);
      if (eventError) throw new Error(`Não foi possível registrar a jornada: ${eventError.message}`);
    }

    return { ok: true as const, tags: data.tags };
  });
