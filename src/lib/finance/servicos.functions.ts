import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ServiceLinesPanel, RevenueComposition } from "./servicos.server";

export type ServicoOption = { id: string; nome: string; cor: string; ativo: boolean };

/** Lista simples de linhas de serviço (para filtros e seletores). */
export const listServicos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ServicoOption[]> => {
    const { data } = await context.supabase
      .from("servicos")
      .select("id, nome, cor, ativo")
      .eq("empresa_id", context.userId)
      .order("nome");
    return (data ?? []).map((s) => ({
      id: s.id,
      nome: s.nome,
      cor: s.cor ?? "#22C55E",
      ativo: s.ativo ?? true,
    }));
  });

/** Cartões por linha de serviço + contratos agrupados. */
export const getServiceLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ year: z.number().int().min(2000).max(2100) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ServiceLinesPanel> => {
    const { serviceLinesPanel } = await import("./servicos.server");
    return serviceLinesPanel(context.supabase, context.userId, data.year);
  });

/** Composição da receita do mês por linha (Visão Geral). */
export const getRevenueComposition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2000).max(2100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<RevenueComposition> => {
    const { revenueByServiceLine } = await import("./servicos.server");
    return revenueByServiceLine(context.supabase, context.userId, data.month, data.year);
  });

export const upsertServico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nome: z.string().min(1),
        cor: z.string().min(4).default("#22C55E"),
        ativo: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      empresa_id: context.userId,
      nome: data.nome.trim(),
      cor: data.cor,
      ativo: data.ativo,
    };
    const q = data.id
      ? context.supabase.from("servicos").update(payload).eq("id", data.id).eq("empresa_id", context.userId)
      : context.supabase.from("servicos").insert(payload);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Move o contrato (projeto) para outra linha, levando recebíveis e despesas. */
export const moveContractToServico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        servicoId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("projects")
      .update({ servico_id: data.servicoId })
      .eq("id", data.projectId)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    const { error: e2 } = await supabase
      .from("finances")
      .update({ servico_id: data.servicoId })
      .eq("project_id", data.projectId)
      .eq("owner_id", userId);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
