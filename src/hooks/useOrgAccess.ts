import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyOrgAccess, type OrgSummary } from "@/lib/org/org.functions";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { OrgModuleCode } from "@/lib/org/modules-map";

/**
 * Organizações e módulos liberados. As organizações compartilham o mesmo id dos
 * workspaces, então a organização ativa acompanha o workspace ativo.
 */
export function useOrgAccess() {
  const fn = useServerFn(getMyOrgAccess);
  const { activeWorkspaceId } = useWorkspace();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-org-access"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.access_token) return null;
      return fn();
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const organizations: OrgSummary[] = data?.organizations ?? [];
  const activeOrg =
    organizations.find((o) => o.id === activeWorkspaceId) ?? organizations[0] ?? null;
  const modules = activeOrg?.modules ?? [];
  const isSuperAdmin = !!data?.isSuperAdmin;
  const ready = !isLoading && !isError && data != null;

  return {
    isLoading: !ready,
    isSuperAdmin,
    organizations,
    activeOrg,
    role: activeOrg?.role ?? null,
    isOrgAdmin: isSuperAdmin || activeOrg?.role === "org_admin",
    modules,
    // Enquanto carrega (ou sem dados) não bloqueia nada: o gate legado continua valendo.
    hasModule: (code: OrgModuleCode) => !ready || isSuperAdmin || modules.includes(code),
  };
}
