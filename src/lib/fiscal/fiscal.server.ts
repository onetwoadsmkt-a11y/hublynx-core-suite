/**
 * Consultas da área Fiscal. Usa apenas as tabelas criadas em 07_fiscal.sql
 * (fiscal_settings, fiscal_service_codes, fiscal_documents,
 * fiscal_document_finances, fiscal_document_items, fiscal_events).
 *
 * Nada aqui chama a API da NFS-e — é leitura/gravação no banco, sempre
 * dentro da organização ativa (RLS por organization_id já garante o resto).
 */
import type {
  FiscalDocumentDetail,
  FiscalDocumentRow,
  FiscalDocumentStatus,
  FiscalEnvironment,
  FiscalOverview,
  FiscalServiceCode,
  FiscalSettings,
  FinanceNfseState,
} from "./types";

// Os tipos gerados do Supabase ainda não conhecem as tabelas fiscais.
export type Db = {
  from: (t: string) => any;
  storage: { from: (b: string) => any };
};

const num = (v: unknown) => Number(v) || 0;

const EMPTY_COUNTS: Record<FiscalDocumentStatus, number> = {
  rascunho: 0,
  pendente: 0,
  processando: 0,
  autorizada: 0,
  rejeitada: 0,
  cancelada: 0,
  erro: 0,
};

/** Painel do topo da tela Fiscal. */
export async function fiscalOverview(sb: Db, orgId: string): Promise<FiscalOverview> {
  const [{ data: docs }, { data: settings }] = await Promise.all([
    sb
      .from("fiscal_documents")
      .select("status, valor_servicos, valor_liquido")
      .eq("organization_id", orgId),
    sb
      .from("fiscal_settings")
      .select("ambiente, ativo")
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);

  const counts = { ...EMPTY_COUNTS };
  let valor_autorizado = 0;
  let valor_pendente = 0;

  for (const d of (docs ?? []) as any[]) {
    const st = d.status as FiscalDocumentStatus;
    if (st in counts) counts[st] += 1;
    const valor = num(d.valor_liquido) || num(d.valor_servicos);
    if (st === "autorizada") valor_autorizado += valor;
    if (st === "pendente" || st === "processando" || st === "rascunho") valor_pendente += valor;
  }

  return {
    ambiente: ((settings?.ambiente as FiscalEnvironment) ?? "homologacao") satisfies FiscalEnvironment,
    configurado: !!settings?.ativo,
    counts,
    valor_autorizado,
    valor_pendente,
  };
}

/** Configuração fiscal da empresa (uma linha por organização). */
export async function fiscalSettings(sb: Db, orgId: string): Promise<FiscalSettings> {
  const { data } = await sb
    .from("fiscal_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  return {
    id: (data?.id as string) ?? null,
    ambiente: ((data?.ambiente as FiscalEnvironment) ?? "homologacao"),
    inscricao_municipal: data?.inscricao_municipal ?? null,
    codigo_municipio: data?.codigo_municipio ?? null,
    regime_tributario: data?.regime_tributario ?? null,
    optante_simples: !!data?.optante_simples,
    incentivo_fiscal: !!data?.incentivo_fiscal,
    serie_dps: data?.serie_dps ?? null,
    proximo_numero_dps: Number(data?.proximo_numero_dps ?? 1),
    certificado_ref: data?.certificado_ref ?? null,
    certificado_validade: data?.certificado_validade ?? null,
    email_envio: data?.email_envio ?? null,
    observacoes_padrao: data?.observacoes_padrao ?? null,
    ativo: !!data?.ativo,
  };
}

/** Serviços fiscais (complemento fiscal das linhas de serviço). */
export async function fiscalServiceCodes(sb: Db, orgId: string): Promise<FiscalServiceCode[]> {
  const { data } = await sb
    .from("fiscal_service_codes")
    .select("*")
    .eq("organization_id", orgId)
    .order("descricao");

  const rows = (data ?? []) as any[];
  const servicoIds = [...new Set(rows.map((r) => r.servico_id).filter(Boolean))] as string[];
  const nomes = new Map<string, string>();
  if (servicoIds.length) {
    const { data: servicos } = await sb.from("servicos").select("id, nome").in("id", servicoIds);
    for (const s of (servicos ?? []) as any[]) nomes.set(s.id, s.nome);
  }

  return rows.map((r) => ({
    id: r.id,
    servico_id: r.servico_id ?? null,
    servico_nome: r.servico_id ? (nomes.get(r.servico_id) ?? null) : null,
    descricao: r.descricao,
    codigo_tributacao_nacional: r.codigo_tributacao_nacional ?? null,
    codigo_tributacao_municipal: r.codigo_tributacao_municipal ?? null,
    cnae: r.cnae ?? null,
    aliquota_iss: r.aliquota_iss === null || r.aliquota_iss === undefined ? null : num(r.aliquota_iss),
    iss_retido: !!r.iss_retido,
    retencao_ir: r.retencao_ir === null || r.retencao_ir === undefined ? null : num(r.retencao_ir),
    retencao_pis: r.retencao_pis === null || r.retencao_pis === undefined ? null : num(r.retencao_pis),
    retencao_cofins:
      r.retencao_cofins === null || r.retencao_cofins === undefined ? null : num(r.retencao_cofins),
    retencao_csll: r.retencao_csll === null || r.retencao_csll === undefined ? null : num(r.retencao_csll),
    retencao_inss: r.retencao_inss === null || r.retencao_inss === undefined ? null : num(r.retencao_inss),
    tributacao_municipio: r.tributacao_municipio ?? null,
    ativo: r.ativo !== false,
  }));
}

export type DocumentFilters = {
  status?: FiscalDocumentStatus | "all";
  clientId?: string | "all";
  from?: string | null;
  to?: string | null;
};

/** Listagem de documentos fiscais com filtros de status, período e cliente. */
export async function fiscalDocuments(
  sb: Db,
  orgId: string,
  filters: DocumentFilters,
): Promise<FiscalDocumentRow[]> {
  let q = sb
    .from("fiscal_documents")
    .select(
      "id, client_id, competencia, valor_servicos, valor_liquido, status, ambiente, dps_numero, dps_serie, nfse_numero, data_emissao, created_at",
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.clientId && filters.clientId !== "all") q = q.eq("client_id", filters.clientId);
  if (filters.from) q = q.gte("created_at", `${filters.from}T00:00:00`);
  if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59`);

  const { data } = await q;
  const rows = (data ?? []) as any[];
  const names = await clientNames(sb, rows.map((r) => r.client_id));

  return rows.map((r) => ({
    id: r.id,
    client_id: r.client_id ?? null,
    client_name: r.client_id ? (names.get(r.client_id) ?? null) : null,
    competencia: r.competencia ?? null,
    valor_servicos: num(r.valor_servicos),
    valor_liquido: num(r.valor_liquido),
    status: r.status as FiscalDocumentStatus,
    ambiente: r.ambiente as FiscalEnvironment,
    dps_numero: r.dps_numero ?? null,
    dps_serie: r.dps_serie ?? null,
    nfse_numero: r.nfse_numero ?? null,
    data_emissao: r.data_emissao ?? null,
    created_at: r.created_at,
  }));
}

async function clientNames(sb: Db, ids: (string | null)[]) {
  const uniq = [...new Set(ids.filter(Boolean))] as string[];
  const map = new Map<string, string>();
  if (!uniq.length) return map;
  const { data } = await sb.from("clients").select("id, name").in("id", uniq);
  for (const c of (data ?? []) as any[]) map.set(c.id, c.name);
  return map;
}

/** Detalhe completo: itens, títulos vinculados, histórico e arquivos. */
export async function fiscalDocumentDetail(
  sb: Db,
  orgId: string,
  id: string,
): Promise<FiscalDocumentDetail | null> {
  const { data: doc } = await sb
    .from("fiscal_documents")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!doc) return null;

  const [{ data: items }, { data: links }, { data: events }] = await Promise.all([
    sb.from("fiscal_document_items").select("*").eq("fiscal_document_id", id).order("ordem"),
    sb.from("fiscal_document_finances").select("*").eq("fiscal_document_id", id),
    sb
      .from("fiscal_events")
      .select("id, tipo, status, mensagem, created_at")
      .eq("fiscal_document_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const financeIds = ((links ?? []) as any[]).map((l) => l.finance_id);
  const financeById = new Map<string, any>();
  if (financeIds.length) {
    const { data: fin } = await sb
      .from("finances")
      .select("id, description, due_date, amount")
      .in("id", financeIds);
    for (const f of (fin ?? []) as any[]) financeById.set(f.id, f);
  }

  const clientName = doc.client_id
    ? (await clientNames(sb, [doc.client_id])).get(doc.client_id) ?? null
    : null;
  let projectName: string | null = null;
  if (doc.project_id) {
    const { data: p } = await sb.from("projects").select("name").eq("id", doc.project_id).maybeSingle();
    projectName = p?.name ?? null;
  }

  const files = {
    pdf: await signedUrl(sb, doc.pdf_bucket, doc.pdf_path),
    xml: await signedUrl(sb, doc.xml_bucket, doc.xml_path),
  };

  return {
    document: {
      id: doc.id,
      client_id: doc.client_id ?? null,
      client_name: clientName,
      project_name: projectName,
      competencia: doc.competencia ?? null,
      valor_servicos: num(doc.valor_servicos),
      valor_liquido: num(doc.valor_liquido),
      valor_deducoes: num(doc.valor_deducoes),
      base_calculo: num(doc.base_calculo),
      aliquota_iss: doc.aliquota_iss === null || doc.aliquota_iss === undefined ? null : num(doc.aliquota_iss),
      valor_iss: num(doc.valor_iss),
      iss_retido: !!doc.iss_retido,
      valor_retencoes: num(doc.valor_retencoes),
      status: doc.status as FiscalDocumentStatus,
      ambiente: doc.ambiente as FiscalEnvironment,
      dps_id: doc.dps_id ?? null,
      dps_numero: doc.dps_numero ?? null,
      dps_serie: doc.dps_serie ?? null,
      nfse_numero: doc.nfse_numero ?? null,
      nfse_chave_acesso: doc.nfse_chave_acesso ?? null,
      nfse_codigo_verificacao: doc.nfse_codigo_verificacao ?? null,
      protocolo: doc.protocolo ?? null,
      data_emissao: doc.data_emissao ?? null,
      data_autorizacao: doc.data_autorizacao ?? null,
      motivo_rejeicao: doc.motivo_rejeicao ?? null,
      motivo_cancelamento: doc.motivo_cancelamento ?? null,
      descricao_servico: doc.descricao_servico ?? null,
      observacoes: doc.observacoes ?? null,
      created_at: doc.created_at,
    },
    items: ((items ?? []) as any[]).map((i) => ({
      id: i.id,
      descricao: i.descricao,
      quantidade: num(i.quantidade),
      valor_unitario: num(i.valor_unitario),
      valor_total: num(i.valor_total),
      aliquota_iss: i.aliquota_iss === null || i.aliquota_iss === undefined ? null : num(i.aliquota_iss),
      valor_iss: num(i.valor_iss),
    })),
    finances: ((links ?? []) as any[]).map((l) => {
      const f = financeById.get(l.finance_id);
      return {
        id: l.id,
        finance_id: l.finance_id,
        description: f?.description ?? null,
        due_date: f?.due_date ?? null,
        amount: num(f?.amount),
        valor_alocado:
          l.valor_alocado === null || l.valor_alocado === undefined ? null : num(l.valor_alocado),
      };
    }),
    events: ((events ?? []) as any[]).map((e) => ({
      id: e.id,
      tipo: e.tipo,
      status: (e.status ?? null) as FiscalDocumentStatus | null,
      mensagem: e.mensagem ?? null,
      created_at: e.created_at,
    })),
    files,
  };
}

async function signedUrl(sb: Db, bucket: string | null, path: string | null) {
  if (!bucket || !path) return null;
  try {
    const { data } = await sb.storage.from(bucket).createSignedUrl(path, 300);
    return (data?.signedUrl as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Situação da NFS-e por título de contas a receber.
 * Deriva de fiscal_document_finances — a estrutura de `finances` não muda.
 */
export async function nfseStateByFinance(
  sb: Db,
  orgId: string,
  financeIds: string[],
): Promise<Record<string, FinanceNfseState>> {
  const out: Record<string, FinanceNfseState> = {};
  if (!financeIds.length) return out;

  const { data: links } = await sb
    .from("fiscal_document_finances")
    .select("finance_id, fiscal_document_id")
    .eq("organization_id", orgId)
    .in("finance_id", financeIds);

  const rows = (links ?? []) as any[];
  if (!rows.length) return out;

  const docIds = [...new Set(rows.map((l) => l.fiscal_document_id))];
  const { data: docs } = await sb.from("fiscal_documents").select("id, status").in("id", docIds);
  const statusById = new Map<string, FiscalDocumentStatus>(
    ((docs ?? []) as any[]).map((d) => [d.id, d.status as FiscalDocumentStatus]),
  );

  for (const l of rows) {
    const st = statusById.get(l.fiscal_document_id);
    const state: FinanceNfseState = st === "autorizada" ? "emitida" : "pendente";
    // "emitida" prevalece quando o título tem mais de um documento vinculado.
    if (out[l.finance_id] !== "emitida") out[l.finance_id] = state;
  }
  return out;
}
