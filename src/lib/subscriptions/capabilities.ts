export type Capability =
  | "hub"
  | "comercial"
  | "operacao"
  | "financeiro"
  | "configuracoes";

/** "financeiro" segue no tipo (pode existir em assinaturas antigas), mas saiu do CRM. */
export const ALL_CAPABILITIES: Capability[] = [
  "hub",
  "comercial",
  "operacao",
  "configuracoes",
];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  hub: "Dashboard",
  comercial: "Comercial",
  operacao: "Operação & Gestão",
  financeiro: "Financeiro",
  configuracoes: "Configurações",
};

/** Prefixos de rota por capability (o mais longo vence). */
const ROUTE_MAP: { prefix: string; cap: Capability }[] = [
  { prefix: "/dashboard", cap: "hub" },
  { prefix: "/app", cap: "hub" },
  { prefix: "/comercial", cap: "comercial" },
  { prefix: "/pipeline", cap: "comercial" },
  { prefix: "/leads", cap: "comercial" },
  { prefix: "/atendimento", cap: "comercial" },
  { prefix: "/tarefas", cap: "operacao" },
  { prefix: "/projetos", cap: "operacao" },
  { prefix: "/agenda", cap: "operacao" },
  { prefix: "/clientes", cap: "operacao" },
  { prefix: "/relatorios", cap: "comercial" },
  { prefix: "/configuracoes", cap: "configuracoes" },
];

export function capabilityForPath(pathname: string): Capability | null {
  const sorted = [...ROUTE_MAP].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const r of sorted) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) return r.cap;
  }
  return null;
}

export const SUBSCRIPTION_STATUSES = ["trial", "ativo", "suspenso", "cancelado"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
