import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  FinanceNfseState,
  FiscalDocumentDetail,
  FiscalDocumentRow,
  FiscalOverview,
  FiscalServiceCode,
  FiscalSettings,
} from "./types";

/** Empresa ativa do usuário, resolvida sempre no servidor. */
async function orgOf(context: { supabase: unknown; userId: string }): Promise<string | null> {
  const { resolveOrganizationId } = await import("@/lib/org/resolve");
  try {
    return await resolveOrganizationId(context.supabase as never, context.userId);
  } catch {
    return null;
  }
}

/** Só administradores da empresa (ou super admin) alteram configuração fiscal. */
async function assertOrgAdmin(context: { supabase: any; userId: string }, orgId: string) {
  const { data: superRow } = await context.supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (superRow) return;

  const { data: member } = await context.supabase
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", orgId)
    .eq("user_id", context.userId)
    .maybeSingle();

  const role = member?.role as string | undefined;
  if ((member?.status ?? "active") !== "active" || (role !== "org_admin" && role !== "owner")) {
    throw new Error("Somente administradores da empresa podem alterar a configuração fiscal.");
  }
}

const EMPTY_OVERVIEW: FiscalOverview = {
  ambiente: "homologacao",
  configurado: false,
  counts: {
    rascunho: 0,
    pendente: 0,
    processando: 0,
    autorizada: 0,
    rejeitada: 0,
    cancelada: 0,
    erro: 0,
  },
  valor_autorizado: 0,
  valor_pendente: 0,
};

export const getFiscalOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FiscalOverview> => {
    const orgId = await orgOf(context);
    if (!orgId) return EMPTY_OVERVIEW;
    const { fiscalOverview } = await import("./fiscal.server");
    return fiscalOverview(context.supabase as never, orgId);
  });

export const getFiscalSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ settings: FiscalSettings | null; canEdit: boolean }> => {
    const orgId = await orgOf(context);
    if (!orgId) return { settings: null, canEdit: false };

    const { fiscalSettings } = await import("./fiscal.server");
    const settings = await fiscalSettings(context.supabase as never, orgId);

    let canEdit = true;
    try {
      await assertOrgAdmin(context as never, orgId);
    } catch {
      canEdit = false;
    }
    return { settings, canEdit };
  });

const settingsInput = z.object({
  ambiente: z.enum(["homologacao", "producao"]),
  inscricao_municipal: z.string().trim().max(40).nullable().optional(),
  codigo_municipio: z.string().trim().max(20).nullable().optional(),
  regime_tributario: z.string().trim().max(80).nullable().optional(),
  optante_simples: z.boolean().default(false),
  incentivo_fiscal: z.boolean().default(false),
  serie_dps: z.string().trim().max(20).nullable().optional(),
  proximo_numero_dps: z.number().int().min(1).default(1),
  certificado_ref: z.string().trim().max(300).nullable().optional(),
  certificado_validade: z.string().trim().nullable().optional(),
  email_envio: z.string().trim().max(255).nullable().optional(),
  observacoes_padrao: z.string().trim().max(2000).nullable().optional(),
  ativo: z.boolean().default(false),
});

const nullify = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" || s === undefined ? null : (s as never);
};

export const saveFiscalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => settingsInput.parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await orgOf(context);
    if (!orgId) throw new Error("Nenhuma empresa ativa para gravar a configuração fiscal.");
    await assertOrgAdmin(context as never, orgId);

    const sb = context.supabase as any;
    const payload = {
      organization_id: orgId,
      ambiente: data.ambiente,
      inscricao_municipal: nullify(data.inscricao_municipal),
      codigo_municipio: nullify(data.codigo_municipio),
      regime_tributario: nullify(data.regime_tributario),
      optante_simples: data.optante_simples,
      incentivo_fiscal: data.incentivo_fiscal,
      serie_dps: nullify(data.serie_dps),
      proximo_numero_dps: data.proximo_numero_dps,
      certificado_ref: nullify(data.certificado_ref),
      certificado_validade: nullify(data.certificado_validade),
      email_envio: nullify(data.email_envio),
      observacoes_padrao: nullify(data.observacoes_padrao),
      ativo: data.ativo,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await sb
      .from("fiscal_settings")
      .select("id")
      .eq("organization_id", orgId)
      .maybeSingle();

    const { error } = existing
      ? await sb.from("fiscal_settings").update(payload).eq("id", existing.id)
      : await sb.from("fiscal_settings").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listFiscalServiceCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ codes: FiscalServiceCode[]; canEdit: boolean }> => {
    const orgId = await orgOf(context);
    if (!orgId) return { codes: [], canEdit: false };
    const { fiscalServiceCodes } = await import("./fiscal.server");
    const codes = await fiscalServiceCodes(context.supabase as never, orgId);
    let canEdit = true;
    try {
      await assertOrgAdmin(context as never, orgId);
    } catch {
      canEdit = false;
    }
    return { codes, canEdit };
  });

const decimal = z.number().min(0).max(100).nullable().optional();

const serviceCodeInput = z.object({
  id: z.string().uuid().optional(),
  descricao: z.string().trim().min(1, "Descrição obrigatória").max(300),
  servico_id: z.string().uuid().nullable().optional(),
  codigo_tributacao_nacional: z.string().trim().max(40).nullable().optional(),
  codigo_tributacao_municipal: z.string().trim().max(40).nullable().optional(),
  cnae: z.string().trim().max(20).nullable().optional(),
  aliquota_iss: decimal,
  iss_retido: z.boolean().default(false),
  retencao_ir: decimal,
  retencao_pis: decimal,
  retencao_cofins: decimal,
  retencao_csll: decimal,
  retencao_inss: decimal,
  tributacao_municipio: z.string().trim().max(120).nullable().optional(),
  ativo: z.boolean().default(true),
});

export const upsertFiscalServiceCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => serviceCodeInput.parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await orgOf(context);
    if (!orgId) throw new Error("Nenhuma empresa ativa para gravar o serviço fiscal.");
    await assertOrgAdmin(context as never, orgId);

    const sb = context.supabase as any;
    const payload = {
      organization_id: orgId,
      descricao: data.descricao.trim(),
      servico_id: data.servico_id ?? null,
      codigo_tributacao_nacional: nullify(data.codigo_tributacao_nacional),
      codigo_tributacao_municipal: nullify(data.codigo_tributacao_municipal),
      cnae: nullify(data.cnae),
      aliquota_iss: data.aliquota_iss ?? null,
      iss_retido: data.iss_retido,
      retencao_ir: data.retencao_ir ?? null,
      retencao_pis: data.retencao_pis ?? null,
      retencao_cofins: data.retencao_cofins ?? null,
      retencao_csll: data.retencao_csll ?? null,
      retencao_inss: data.retencao_inss ?? null,
      tributacao_municipio: nullify(data.tributacao_municipio),
      ativo: data.ativo,
      updated_at: new Date().toISOString(),
    };

    const { error } = data.id
      ? await sb
          .from("fiscal_service_codes")
          .update(payload)
          .eq("id", data.id)
          .eq("organization_id", orgId)
      : await sb.from("fiscal_service_codes").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setFiscalServiceCodeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await orgOf(context);
    if (!orgId) throw new Error("Nenhuma empresa ativa.");
    await assertOrgAdmin(context as never, orgId);
    const sb = context.supabase as any;
    const { error } = await sb
      .from("fiscal_service_codes")
      .update({ ativo: data.ativo, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listFiscalDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z
          .enum([
            "all",
            "rascunho",
            "pendente",
            "processando",
            "autorizada",
            "rejeitada",
            "cancelada",
            "erro",
          ])
          .default("all"),
        clientId: z.string().default("all"),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<FiscalDocumentRow[]> => {
    const orgId = await orgOf(context);
    if (!orgId) return [];
    const { fiscalDocuments } = await import("./fiscal.server");
    return fiscalDocuments(context.supabase as never, orgId, {
      status: data.status,
      clientId: data.clientId,
      from: data.from ?? null,
      to: data.to ?? null,
    });
  });

export const getFiscalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<FiscalDocumentDetail | null> => {
    const orgId = await orgOf(context);
    if (!orgId) return null;
    const { fiscalDocumentDetail } = await import("./fiscal.server");
    return fiscalDocumentDetail(context.supabase as never, orgId, data.id);
  });

/** Situação da NFS-e dos títulos exibidos em Contas a Receber. */
export const getNfseStateForFinances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ financeIds: z.array(z.string().uuid()).max(500) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<Record<string, FinanceNfseState>> => {
    const orgId = await orgOf(context);
    if (!orgId || data.financeIds.length === 0) return {};
    const { nfseStateByFinance } = await import("./fiscal.server");
    return nfseStateByFinance(context.supabase as never, orgId, data.financeIds);
  });
