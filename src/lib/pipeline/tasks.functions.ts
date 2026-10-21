import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paging";
import type { LeadScheduledTask } from "./task-display";

export const listLeadScheduledTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // The parent lead supplies tenant scope, including schedules saved before organization inheritance.
    // Both reads retain the caller's RLS; no privileged client is used.
    const rows = await fetchAllRows(() => context.supabase
      .from("lead_tasks")
      .select("*, leads!inner(id,name,converted_client_id,converted_project_id)")
      .eq("leads.organization_id", data.organizationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }));
    return rows as LeadScheduledTask[];
  });