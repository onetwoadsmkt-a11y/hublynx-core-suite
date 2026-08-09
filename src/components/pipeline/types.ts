import type { Tables } from "@/integrations/supabase/types";

export type Lead = Tables<"leads">;
export type PipelineStage = Tables<"pipeline_stages">;
export type LeadNote = Tables<"lead_notes">;
export type LeadEvent = Tables<"lead_events">;
export type LeadWebhook = Tables<"lead_webhooks">;
