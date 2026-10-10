import { useWorkspace } from "@/hooks/useWorkspace";
import type { OrgModuleCode } from "@/lib/org/modules-map";

/**
 * Módulos liberados na empresa ativa. A fonte é o contexto de organização
 * (`WorkspaceProvider`), que já consulta `getMyOrgAccess` uma única vez.
 */
export function useOrgAccess() {
  const {
    organizations, activeOrganization, isSuperAdmin, isLoading, isError, retryAccess,
  } = useWorkspace();

  const modules = activeOrganization?.modules ?? [];

  return {
    isLoading,
    isError,
    retryAccess,
    isSuperAdmin,
    organizations,
    activeOrg: activeOrganization,
    role: activeOrganization?.role ?? null,
    isOrgAdmin: isSuperAdmin || activeOrganization?.role === "org_admin",
    modules,
    hasModule: (code: OrgModuleCode) => isSuperAdmin || modules.includes(code),
  };
}
