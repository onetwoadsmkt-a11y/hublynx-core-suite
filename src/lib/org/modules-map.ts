/** Códigos de módulo cadastrados em public.modules. */
export type OrgModuleCode = "crm" | "projects" | "finance";

export const ORG_MODULE_LABELS: Record<OrgModuleCode, string> = {
  crm: "Hublynx CRM",
  projects: "Hublynx Projects",
  finance: "Hublynx Finance",
};

/** Prefixos de rota por módulo (o mais longo vence). Rotas ausentes são sempre liberadas. */
const ROUTE_MAP: { prefix: string; code: OrgModuleCode }[] = [
  { prefix: "/pipeline", code: "crm" },
  { prefix: "/comercial", code: "crm" },
  { prefix: "/clientes", code: "crm" },
  { prefix: "/atendimento", code: "crm" },
  { prefix: "/gestao/clientes", code: "crm" },
  { prefix: "/projetos", code: "projects" },
  { prefix: "/tarefas", code: "projects" },
  { prefix: "/agenda", code: "projects" },
  { prefix: "/arquivos", code: "projects" },
  { prefix: "/relatorios", code: "projects" },
  { prefix: "/financeiro", code: "finance" },
];

export function orgModuleForPath(pathname: string): OrgModuleCode | null {
  const sorted = [...ROUTE_MAP].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const r of sorted) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) return r.code;
  }
  return null;
}
