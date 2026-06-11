// Use DB enums directly.
// kind: 'receber' (receita) | 'pagar' (despesa)
// status: 'pendente' | 'pago' | 'atrasado'
export type FinanceKind = "receber" | "pagar";
export type FinanceStatus = "pendente" | "pago" | "atrasado";
export type Recurrence = "none" | "monthly";

export const KIND_LABEL: Record<FinanceKind, string> = { receber: "Receita", pagar: "Despesa" };
export const STATUS_LABEL: Record<FinanceStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
};

export type FinanceRow = {
  id: string;
  kind: FinanceKind;
  description: string | null;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: FinanceStatus;
  client_id: string | null;
  project_id: string | null;
  category_id: string | null;
  supplier: string | null;
  payment_method: string | null;
  recurrence: Recurrence;
  recurrence_day: number | null;
  recurrence_until: string | null;
  parent_id: string | null;
  installment_no: number | null;
  installment_total: number | null;
  client_name: string | null;
  project_name: string | null;
  category_name: string | null;
};

export type FinanceCategory = {
  id: string;
  kind: FinanceKind;
  name: string;
  is_default: boolean;
};

export type DashboardKpis = {
  receita_realizada: number;
  receita_prevista: number;
  despesa_realizada: number;
  despesa_prevista: number;
  lucro: number;
  margem: number;
  saldo_caixa: number;
  inadimplencia: number;
  mrr: number;
};

export type CashflowPoint = { date: string; in: number; out: number; balance: number };

export type DREData = {
  receita_bruta: number;
  custos_operacionais: number;
  despesas: number;
  lucro_liquido: number;
};

export type ProfitabilityRow = {
  id: string;
  name: string;
  receita: number;
  custos: number;
  lucro: number;
  margem: number;
};

export type ForecastBucket = {
  label: string;
  days: number;
  receivables: number;
  payables: number;
  saldo: number;
  items: { id: string; due_date: string; description: string; amount: number; kind: FinanceKind }[];
};

export type AlertItem = {
  id: string;
  level: "red" | "yellow" | "green";
  title: string;
  description: string;
};
