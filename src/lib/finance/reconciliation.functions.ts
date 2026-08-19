import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ReconciliationReport } from "./reconciliation.server";

/** Roda os testes de conciliação ao vivo sobre os dados reais. */
export const getReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2000).max(2100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ReconciliationReport> => {
    const { reconciliationReport } = await import("./reconciliation.server");
    return reconciliationReport(context.supabase, context.userId, data.month, data.year);
  });
