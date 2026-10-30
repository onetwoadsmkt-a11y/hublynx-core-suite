import { evalExpr } from "./sheet-formula";
/**
 * Departamentos e planilhas de controle de custo (Fase 4). Estrutura genérica:
 * cada empresa cria os departamentos que quiser e define as colunas de cada planilha.
 * Os modelos abaixo são só pontos de partida — tudo pode ser renomeado e ajustado.
 */

export type CostColumnType =
  "text" | "number" | "currency" | "percent" | "date" | "status" | "boolean" | "calc" | "validity";

export type CostStatusOption = { label: string; color: string; done?: boolean };

export type CostColumn = {
  key: string;
  label: string;
  type: CostColumnType;
  /** opções do tipo "status" (lista com cores); done = conta como resolvido */
  options?: CostStatusOption[];
  /** mostra o total no rodapé (number, currency, calc) */
  sum?: boolean;
  /** datas: pinta de vermelho quando vencida e a linha não está resolvida */
  alert?: boolean;
  /**
   * coluna calculada: a (op) b; asPercent mostra em %.
   * expr (importada do Excel): expressão com {chave} das colunas, + - * / ( ) e round/abs/min/max.
   */
  calc?: { op: "div" | "mul" | "sub" | "add"; a: string; b: string; asPercent?: boolean; asCurrency?: boolean; expr?: string };
  width?: number;
  /** "validity": situação calculada pela data de outra coluna (ex.: validade do C.A.) */
  validity?: { ref: string };
};

/** Dados da planilha fora da tabela (cabeçalho do formulário, acréscimos ao total, observações). */
export type SheetInfo = {
  title?: string;
  fields?: { key: string; label: string; value: string }[];
  /** somados ao total dos itens (ex.: substituição tributária, frete) */
  adjustments?: { key: string; label: string; value: number | null; note?: string }[];
  notes?: { label: string; value: string }[];
  /** coluna cujo total é o "total dos itens" do resumo */
  totalKey?: string;
  /** arquivos anexados à planilha (ex.: o Excel importado) — gravados só pelo servidor */
  attachments?: SheetAttachment[];
};

export type SheetAttachment = {
  id: string;
  name: string;
  size: number;
  mime: string;
  path: string;
  uploaded_at: string;
  uploaded_by: string;
  author: string;
  /** veio da importação da planilha */
  imported?: boolean;
};

/**
 * "Itens comprados" no modelo da Solicitação de Compras (SC): mesmas chaves de antes
 * (os lançamentos continuam valendo) + situação do C.A., ST e o total com IPI.
 */
export const PURCHASE_COLUMNS: CostColumn[] = [
  { key: "fornecedor", label: "Fornecedor", type: "text", width: 160 },
  { key: "produto", label: "Descrição do produto", type: "text", width: 280 },
  { key: "certificado", label: "CA", type: "text", width: 100 },
  { key: "validade", label: "Valid CA", type: "date", alert: true },
  { key: "situacao_ca", label: "Situação do C.A.", type: "validity", validity: { ref: "validade" } },
  { key: "fatura_em", label: "Fatura em", type: "text", width: 130 },
  { key: "valor_unit", label: "Val. unit.", type: "currency" },
  { key: "quantidade", label: "Quant.", type: "number", sum: true },
  { key: "st", label: "ST", type: "currency" },
  { key: "icms", label: "ICMS", type: "percent" },
  { key: "ipi", label: "IPI", type: "percent" },
  {
    key: "total",
    label: "Valor total",
    type: "calc",
    sum: true,
    calc: { op: "mul", a: "valor_unit", b: "quantidade", asCurrency: true, expr: "{valor_unit}*{quantidade}*(1+({ipi}/100))" },
  },
];

/** Cabeçalho, acréscimos e condições da Solicitação de Compras (valores em branco). */
export const PURCHASE_INFO: SheetInfo = {
  title: "Solicitação de compras",
  fields: [
    { key: "n_s_c", label: "Nº S.C", value: "" },
    { key: "data", label: "Data", value: "" },
    { key: "franquia", label: "Franquia", value: "" },
    { key: "contato", label: "Contato", value: "" },
    { key: "e_mail", label: "E-mail", value: "" },
    { key: "telefone", label: "Telefone", value: "" },
  ],
  adjustments: [
    { key: "substituicao_tributaria", label: "Substituição tributária", value: null },
    { key: "frete", label: "Frete", value: null, note: "FOB" },
  ],
  notes: [
    { label: "Condições de pagamento", value: "" },
    { label: "Frete", value: "FOB" },
  ],
  totalKey: "total",
};

const OLD_PURCHASE_KEYS = ["fornecedor", "produto", "certificado", "validade", "fatura_em", "valor_unit", "quantidade", "icms", "ipi", "total"];
const normName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Aba "Itens comprados" ainda no formato antigo → mostra no modelo da SC (colunas extras
 * criadas pela empresa ficam no fim). Abas importadas ou já ajustadas não mudam.
 */
export function upgradePurchaseSheet(name: string, columns: CostColumn[], info: SheetInfo | null | undefined) {
  if (normName(name) !== "itens comprados") return { columns, info: info ?? {} };
  const keys = new Set(columns.map((c) => c.key));
  const isOld = !columns.some((c) => c.type === "validity") && OLD_PURCHASE_KEYS.every((k) => keys.has(k));
  const cols = isOld
    ? [...PURCHASE_COLUMNS, ...columns.filter((c) => !PURCHASE_COLUMNS.some((p) => p.key === c.key))]
    : columns;
  const empty = !info || !(info.fields?.length || info.adjustments?.length || info.notes?.length || info.title);
  const merged = empty && isOld ? { ...PURCHASE_INFO, ...(info?.attachments ? { attachments: info.attachments } : {}) } : (info ?? {});
  return { columns: cols, info: merged };
}

/** Faixas da situação pela data (mesmas da planilha de compras). */
export function validityState(dateIso: unknown, today = new Date()) {
  if (typeof dateIso !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(dateIso)) return null;
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  const due = new Date(y, m - 1, d).getTime();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.round((due - t0) / 86_400_000);
  if (days > 180) return { label: "Válido", tone: "ok", days } as const;
  if (days > 90) return { label: "Atenção", tone: "warn", days } as const;
  if (days > 45) return { label: "Ação", tone: "action", days } as const;
  if (days > 0) return { label: "Informativo", tone: "info", days } as const;
  return { label: "Vencido", tone: "late", days } as const;
}

export type CostSheetPreset = { name: string; columns: CostColumn[] };
export type CostDepartmentPreset = {
  key: string;
  name: string;
  color: string;
  description: string;
  sheets: CostSheetPreset[];
};

export const COLUMN_TYPE_LABEL: Record<CostColumnType, string> = {
  text: "Texto",
  number: "Número",
  currency: "Valor (R$)",
  percent: "Percentual",
  date: "Data",
  status: "Status (lista)",
  boolean: "Sim / Não",
  calc: "Cálculo",
  validity: "Situação pela validade",
};

export const STATUS_COLORS = [
  "#16a34a",
  "#2563eb",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#64748b",
  "#db2777",
];

export function slugKey(label: string, taken: Set<string> = new Set()): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 32) || "coluna";
  let k = base;
  let i = 2;
  while (taken.has(k)) k = `${base}_${i++}`;
  return k;
}

const ORDER_STATUS: CostStatusOption[] = [
  { label: "Cotando", color: "#64748b" },
  { label: "Aguardando aprovação", color: "#f59e0b" },
  { label: "Pedido feito", color: "#2563eb" },
  { label: "Faturado", color: "#7c3aed" },
  { label: "Entregue", color: "#16a34a", done: true },
  { label: "Cancelado", color: "#dc2626", done: true },
];

export const DEPARTMENT_PRESETS: CostDepartmentPreset[] = [
  {
    key: "compras",
    name: "Compras",
    color: "#2563eb",
    description: "Pedidos a fornecedores, itens comprados e cotação de frete",
    sheets: [
      {
        name: "Pedidos a fornecedores",
        columns: [
          { key: "fornecedor", label: "Fornecedor", type: "text", width: 180 },
          {
            key: "enviado",
            label: "Enviado ao cliente",
            type: "status",
            options: [
              { label: "Sim", color: "#16a34a" },
              { label: "Não", color: "#dc2626" },
              { label: "Extra", color: "#7c3aed" },
            ],
          },
          { key: "dias_faturar", label: "Dias úteis p/ faturar", type: "number" },
          { key: "fechamento", label: "Data fechamento", type: "date" },
          { key: "pagamento", label: "Data pagamento", type: "date", alert: true },
          { key: "previsao", label: "Previsão faturamento", type: "date", alert: true },
          { key: "status", label: "Status", type: "status", options: ORDER_STATUS },
          {
            key: "tipo_frete",
            label: "Tipo frete",
            type: "status",
            options: [
              { label: "CIF", color: "#0891b2" },
              { label: "FOB", color: "#f59e0b" },
            ],
          },
          { key: "valor", label: "Valor", type: "currency", sum: true },
          { key: "cond_pagamento", label: "Cond. pagamento", type: "text", width: 200 },
          { key: "pedido", label: "Nº pedido", type: "text" },
          { key: "nota", label: "Nº nota", type: "text" },
          { key: "transportadora", label: "Transportadora", type: "text" },
          { key: "dias_entrega", label: "Dias úteis coleta+entrega", type: "number" },
          { key: "valor_frete", label: "Valor do frete", type: "currency", sum: true },
          {
            key: "pct_frete",
            label: "% frete",
            type: "calc",
            calc: { op: "div", a: "valor_frete", b: "valor", asPercent: true },
          },
        ],
      },
      {
        name: "Itens comprados",
        columns: PURCHASE_COLUMNS,
      },
      {
        name: "Cotação de frete",
        columns: [
          { key: "coleta", label: "Coleta (fornecedor)", type: "text", width: 200 },
          { key: "transportadora", label: "Transportadora", type: "text" },
          { key: "volumes", label: "Volumes", type: "text" },
          { key: "peso", label: "Peso total (kg)", type: "number", sum: true },
          { key: "medidas", label: "Medidas", type: "text" },
          { key: "valor_nf", label: "Valor NF", type: "currency", sum: true },
          { key: "valor_frete", label: "Valor frete", type: "currency", sum: true },
          {
            key: "pct_frete",
            label: "% frete",
            type: "calc",
            calc: { op: "div", a: "valor_frete", b: "valor_nf", asPercent: true },
          },
          { key: "entrega", label: "Endereço de entrega", type: "text", width: 220 },
        ],
      },
    ],
  },
  {
    key: "obras",
    name: "Obras e instalação",
    color: "#f59e0b",
    description: "Orçamentos e execução de reforma, fachada, mobiliário",
    sheets: [
      {
        name: "Orçamentos e serviços",
        columns: [
          { key: "item", label: "Item / serviço", type: "text", width: 220 },
          { key: "fornecedor", label: "Fornecedor", type: "text", width: 160 },
          { key: "orcado", label: "Valor orçado", type: "currency", sum: true },
          { key: "realizado", label: "Valor realizado", type: "currency", sum: true },
          {
            key: "diferenca",
            label: "Diferença",
            type: "calc",
            sum: true,
            calc: { op: "sub", a: "realizado", b: "orcado" },
          },
          { key: "inicio", label: "Início", type: "date" },
          { key: "entrega", label: "Entrega", type: "date", alert: true },
          {
            key: "status",
            label: "Status",
            type: "status",
            options: [
              { label: "Orçando", color: "#64748b" },
              { label: "Aprovado", color: "#2563eb" },
              { label: "Em execução", color: "#f59e0b" },
              { label: "Concluído", color: "#16a34a", done: true },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "marketing",
    name: "Marketing",
    color: "#db2777",
    description: "Ações de inauguração e divulgação",
    sheets: [
      {
        name: "Ações e investimento",
        columns: [
          { key: "acao", label: "Ação", type: "text", width: 220 },
          { key: "canal", label: "Canal", type: "text" },
          { key: "data", label: "Data", type: "date", alert: true },
          { key: "valor", label: "Investimento", type: "currency", sum: true },
          {
            key: "status",
            label: "Status",
            type: "status",
            options: [
              { label: "Planejada", color: "#64748b" },
              { label: "Em andamento", color: "#f59e0b" },
              { label: "Feita", color: "#16a34a", done: true },
            ],
          },
        ],
      },
    ],
  },
];

export const BLANK_SHEET: CostSheetPreset = {
  name: "Controle",
  columns: [
    { key: "descricao", label: "Descrição", type: "text", width: 220 },
    { key: "valor", label: "Valor", type: "currency", sum: true },
    { key: "data", label: "Data", type: "date", alert: true },
    {
      key: "status",
      label: "Status",
      type: "status",
      options: [
        { label: "Pendente", color: "#f59e0b" },
        { label: "Concluído", color: "#16a34a", done: true },
      ],
    },
  ],
};

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, "").replace(/^R\$/i, "").replace(/%$/, "");
  // "1.234,56" → 1234.56 · "1.234.567" → 1234567 · "21.77" → 21.77
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : (s.match(/\./g) ?? []).length > 1
      ? s.replace(/\./g, "")
      : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function calcValue(
  col: CostColumn,
  row: Record<string, unknown>,
  columns?: CostColumn[],
  depth = 0,
): number | null {
  if (!col.calc) return null;
  if (col.calc.expr) {
    if (depth > 6) return null;
    try {
      return evalExpr(col.calc.expr, (key) => {
        const ref = columns?.find((c) => c.key === key);
        if (ref && ref.type === "calc") return calcValue(ref, row, columns, depth + 1) ?? 0;
        return toNumber(row[key]) ?? 0; // célula vazia conta como 0, como no Excel
      });
    } catch {
      return null;
    }
  }
  const a = toNumber(row[col.calc.a]);
  const b = toNumber(row[col.calc.b]);
  if (a === null || b === null) return null;
  switch (col.calc.op) {
    case "div":
      return b === 0 ? null : col.calc.asPercent ? (a / b) * 100 : a / b;
    case "mul":
      return a * b;
    case "sub":
      return a - b;
    case "add":
      return a + b;
  }
}
