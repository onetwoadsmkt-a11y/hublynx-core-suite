import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scopeOrganization } from "@/lib/org/filter";
import { fetchAllRows } from "@/lib/supabase-paging";

export const getLeadsReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        pipelineId: z.string().uuid().nullable().optional(),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
        organizationId: z.string().uuid().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [{ data: pipelines }, { data: stages }] = await Promise.all([
      supabase.from("pipelines").select("*").order("position"),
      supabase.from("pipeline_stages").select("*").order("position"),
    ]);

    const buildQuery = () => {
      let q = scopeOrganization(
        supabase
          .from("leads")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true }),
        data.organizationId,
      );
      if (data.from) q = q.gte("created_at", `${data.from}T00:00:00`);
      if (data.to) q = q.lte("created_at", `${data.to}T23:59:59`);
      if (data.pipelineId) {
        const ids = (stages ?? [])
          .filter((s) => s.pipeline_id === data.pipelineId)
          .map((s) => s.id);
        q = q.in("stage_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      }
      return q;
    };
    const leads = await fetchAllRows(buildQuery);

    const leadIds = (leads ?? []).map((l) => l.id);
    let notes: { id: string; lead_id: string; body: string; created_at: string }[] = [];
    let events: {
      id: string;
      lead_id: string;
      kind: string;
      title: string;
      description: string | null;
      created_at: string;
    }[] = [];
    let leadTasks: { lead_id: string; done: boolean; due_at: string | null }[] = [];

    for (let i = 0; i < leadIds.length; i += 300) {
      const chunk = leadIds.slice(i, i + 300);
      const [n, e, t] = await Promise.all([
        supabase
          .from("lead_notes")
          .select("id, lead_id, body, created_at")
          .in("lead_id", chunk)
          .order("created_at", { ascending: true }),
        supabase
          .from("lead_events")
          .select("id, lead_id, kind, title, description, created_at")
          .in("lead_id", chunk)
          .order("created_at", { ascending: true }),
        supabase
          .from("lead_tasks")
          .select("lead_id, done, due_at")
          .in("lead_id", chunk),
      ]);
      notes = notes.concat(n.data ?? []);
      events = events.concat(e.data ?? []);
      leadTasks = leadTasks.concat((t.data ?? []) as typeof leadTasks);
    }

    // Tags configuradas nos pipelines (para o filtro) e regras de ganho.
    const { readTagsForPipelines } = await import("./tags.server");
    const byPipeline = await readTagsForPipelines((pipelines ?? []).map((p) => p.id as string));
    const tags = Object.entries(byPipeline).flatMap(([pipelineId, list]) =>
      list.map((tg) => ({ ...tg, pipeline_id: pipelineId })));

    return {
      pipelines: pipelines ?? [],
      stages: stages ?? [],
      leads: leads ?? [],
      notes,
      events,
      leadTasks,
      tags,
      wonTagSlugs: [...new Set(tags.filter((tg) => tg.funnel_key === "ganho").map((tg) => tg.slug.toLowerCase()))],
      wonStageIds: (stages ?? []).filter((st) => st.is_won).map((st) => st.id as string),
    };
  });
