import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getLeadsReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        pipelineId: z.string().uuid().nullable().optional(),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [{ data: pipelines }, { data: stages }] = await Promise.all([
      supabase.from("pipelines").select("*").order("position"),
      supabase.from("pipeline_stages").select("*").order("position"),
    ]);

    let q = supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59`);
    if (data.pipelineId) {
      const ids = (stages ?? [])
        .filter((s) => s.pipeline_id === data.pipelineId)
        .map((s) => s.id);
      q = q.in("stage_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    }
    const { data: leads, error } = await q;
    if (error) throw new Error(error.message);

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

    for (let i = 0; i < leadIds.length; i += 300) {
      const chunk = leadIds.slice(i, i + 300);
      const [n, e] = await Promise.all([
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
      ]);
      notes = notes.concat(n.data ?? []);
      events = events.concat(e.data ?? []);
    }

    return {
      pipelines: pipelines ?? [],
      stages: stages ?? [],
      leads: leads ?? [],
      notes,
      events,
    };
  });
