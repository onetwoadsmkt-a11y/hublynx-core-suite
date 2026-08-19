import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { FinanceMetrics, FinanceMetricsSeries } from "./metrics.server";

/** Indicadores do mês selecionado — fonte única para todas as telas. */
export const getFinanceMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2000).max(2100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<FinanceMetrics> => {
    const { financeMetrics } = await import("./metrics.server");
    return financeMetrics(context.supabase, context.userId, data.month, data.year);
  });

/** Mesma matemática, mês a mês (Recebíveis, Previsão e Relatórios). */
export const getFinanceMetricsSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        startMonth: z.number().int().min(1).max(12),
        startYear: z.number().int().min(2000).max(2100),
        months: z.number().int().min(1).max(24).default(12),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<FinanceMetricsSeries> => {
    const { financeMetricsSeries } = await import("./metrics.server");
    return financeMetricsSeries(
      context.supabase,
      context.userId,
      data.startMonth,
      data.startYear,
      data.months,
    );
  });
