/** Códigos de módulo cadastrados em public.modules. */
export type OrgModuleCode = "crm" | "tasks" | "projects" | "finance" | "fiscal";

export const ORG_MODULE_LABELS: Record<OrgModuleCode, string> = {
  crm: "Hublynx Comercial",
  tasks: "Hublynx Tarefas & Agenda",
  projects: "Hublynx Projects",
  finance: "Hublynx Finance",
  fiscal: "Hublynx Fiscal",
};

/**
 * Dependências entre módulos: ligar a chave liga também os valores;
 * desligar um valor desliga quem depende dele.
 */
export const ORG_MODULE_DEPENDS_ON: Partial<Record<OrgModuleCode, OrgModuleCode[]>> = {
  projects: ["tasks"],
  fiscal: ["finance"],
};

/**
 * Prefixos de rota por módulo (o mais longo vence). Rotas ausentes são a Base,
 * sempre liberada: Dashboard, Clientes e Configurações. O Financeiro saiu do CRM:
 * os códigos "finance" e "fiscal" seguem no tipo porque existem no banco.
 */
const ROUTE_MAP: { prefix: string; code: OrgModuleCode }[] = [
  { prefix: "/pipeline", code: "crm" },
  { prefix: "/comercial", code: "crm" },
  { prefix: "/leads", code: "crm" },
  { prefix: "/formularios", code: "crm" },
  { prefix: "/atendimento", code: "crm" },
  { prefix: "/tarefas", code: "tasks" },
  { prefix: "/agenda", code: "tasks" },
  { prefix: "/projetos", code: "projects" },
  { prefix: "/relatorios", code: "crm" },
];

export function orgModuleForPath(pathname: string): OrgModuleCode | null {
  const sorted = [...ROUTE_MAP].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const r of sorted) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) return r.code;
  }
  return null;
}
