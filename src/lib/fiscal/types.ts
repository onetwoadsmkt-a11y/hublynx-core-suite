/**
 * Tipos da área Fiscal (NFS-e padrão nacional / DPS).
 * Espelham as tabelas criadas na etapa 07_fiscal.sql. Nenhuma emissão real
 * acontece aqui — esta camada só lê e grava configuração e documentos.
 */

export type FiscalEnvironment = "homologacao" | "producao";

export type FiscalDocumentStatus =
  | "rascunho"
  | "pendente"
  | "processando"
  | "autorizada"
  | "rejeitada"
  | "cancelada"
  | "erro";

export const FISCAL_STATUS_LABEL: Record<FiscalDocumentStatus, string> = {
  rascunho: "Rascunho",
  pendente: "Pendente",
  processando: "Em processamento",
  autorizada: "Autorizada",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
  erro: "Erro",
};

export const FISCAL_ENVIRONMENT_LABEL: Record<FiscalEnvironment, string> = {
  homologacao: "Homologação",
  producao: "Produção",
};

export type FiscalOverview = {
  ambiente: FiscalEnvironment;
  configurado: boolean;
  counts: Record<FiscalDocumentStatus, number>;
  valor_autorizado: number;
  valor_pendente: number;
};

export type FiscalSettings = {
  id: string | null;
  ambiente: FiscalEnvironment;
  inscricao_municipal: string | null;
  codigo_municipio: string | null;
  regime_tributario: string | null;
  optante_simples: boolean;
  incentivo_fiscal: boolean;
  serie_dps: string | null;
  proximo_numero_dps: number;
  certificado_ref: string | null;
  certificado_validade: string | null;
  email_envio: string | null;
  observacoes_padrao: string | null;
  ativo: boolean;
};

export type FiscalServiceCode = {
  id: string;
  servico_id: string | null;
  servico_nome: string | null;
  descricao: string;
  codigo_tributacao_nacional: string | null;
  codigo_tributacao_municipal: string | null;
  cnae: string | null;
  aliquota_iss: number | null;
  iss_retido: boolean;
  retencao_ir: number | null;
  retencao_pis: number | null;
  retencao_cofins: number | null;
  retencao_csll: number | null;
  retencao_inss: number | null;
  tributacao_municipio: string | null;
  ativo: boolean;
};

export type FiscalDocumentRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  competencia: string | null;
  valor_servicos: number;
  valor_liquido: number;
  status: FiscalDocumentStatus;
  ambiente: FiscalEnvironment;
  dps_numero: string | null;
  dps_serie: string | null;
  nfse_numero: string | null;
  data_emissao: string | null;
  created_at: string;
};

export type FiscalDocumentItem = {
  id: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  aliquota_iss: number | null;
  valor_iss: number;
};

export type FiscalDocumentFinance = {
  id: string;
  finance_id: string;
  description: string | null;
  due_date: string | null;
  amount: number;
  valor_alocado: number | null;
};

export type FiscalEvent = {
  id: string;
  tipo: string;
  status: FiscalDocumentStatus | null;
  mensagem: string | null;
  created_at: string;
};

export type FiscalDocumentDetail = {
  document: FiscalDocumentRow & {
    project_name: string | null;
    valor_deducoes: number;
    base_calculo: number;
    aliquota_iss: number | null;
    valor_iss: number;
    iss_retido: boolean;
    valor_retencoes: number;
    nfse_chave_acesso: string | null;
    nfse_codigo_verificacao: string | null;
    protocolo: string | null;
    data_autorizacao: string | null;
    motivo_rejeicao: string | null;
    motivo_cancelamento: string | null;
    descricao_servico: string | null;
    observacoes: string | null;
    dps_id: string | null;
  };
  items: FiscalDocumentItem[];
  finances: FiscalDocumentFinance[];
  events: FiscalEvent[];
  files: { pdf: string | null; xml: string | null };
};

/** Situação da NFS-e de um título de contas a receber. */
export type FinanceNfseState = "emitida" | "pendente" | "nao_emitir";

export const NFSE_STATE_LABEL: Record<FinanceNfseState, string> = {
  emitida: "NFS-e emitida",
  pendente: "NFS-e pendente",
  nao_emitir: "Não emitir",
};
