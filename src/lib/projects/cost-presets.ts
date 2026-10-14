/**
 * Departamentos e planilhas de controle de custo (Fase 4). Estrutura genérica:
 * cada empresa cria os departamentos que quiser e define as colunas de cada planilha.
 * Os modelos abaixo são só pontos de partida — tudo pode ser renomeado e ajustado.
 */

export type CostColumnType =
  "text" | "number" | "currency" | "percent" | "date" | "status" | "boolean" | "calc";

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
  /** coluna calculada: a (op) b; asPercent mostra em % */
  calc?: { op: "div" | "mul" | "sub" | "add"; a: string; b: string; asPercent?: boolean };
  width?: number;
};

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
        columns: [
          { key: "fornecedor", label: "Fornecedor", type: "text", width: 160 },
          { key: "produto", label: "Descrição do produto", type: "text", width: 240 },
          { key: "certificado", label: "Certificado / CA", type: "text" },
          { key: "validade", label: "Validade", type: "date", alert: true },
          { key: "fatura_em", label: "Fatura em", type: "text" },
          { key: "valor_unit", label: "Valor unitário", type: "currency" },
          { key: "quantidade", label: "Quantidade", type: "number", sum: true },
          { key: "icms", label: "ICMS", type: "percent" },
          { key: "ipi", label: "IPI", type: "percent" },
          {
            key: "total",
            label: "Valor total",
            type: "calc",
            sum: true,
            calc: { op: "mul", a: "valor_unit", b: "quantidade" },
          },
        ],
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
  const s = String(v).trim().replace(/\s/g, "").replace(/^R\$/, "").replace(/%$/, "");
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function calcValue(col: CostColumn, row: Record<string, unknown>): number | null {
  if (!col.calc) return null;
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
