import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyOrgAccess, type OrgSummary } from "@/lib/org/org.functions";

const STORAGE_KEY = "hublynx-active-organization";

export type OrganizationOption = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  role: string;
  modules: string[];
  /** White label da empresa. */
  logoUrl: string | null;
  brandColor: string | null;
};

type WorkspaceContextValue = {
  /** Empresas (organizações) que o usuário pode acessar. */
  organizations: OrganizationOption[];
  /** Alias legado — mesma lista de organizações. */
  workspaces: OrganizationOption[];
  activeOrganization: OrganizationOption | null;
  activeOrganizationId: string | null;
  /** Alias legado. */
  activeWorkspace: OrganizationOption | null;
  activeWorkspaceId: string | null;
  role: string | null;
  isSuperAdmin: boolean;
  setActiveOrganization: (id: string) => void;
  /** Alias legado. */
  setActiveWorkspace: (id: string) => void;
  isLoading: boolean;
};

const EMPTY: WorkspaceContextValue = {
  organizations: [],
  workspaces: [],
  activeOrganization: null,
  activeOrganizationId: null,
  activeWorkspace: null,
  activeWorkspaceId: null,
  role: null,
  isSuperAdmin: false,
  setActiveOrganization: () => {},
  setActiveWorkspace: () => {},
  isLoading: true,
};

const Ctx = createContext<WorkspaceContextValue>(EMPTY);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const fn = useServerFn(getMyOrgAccess);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  const { data, isLoading } = useQuery({
    queryKey: ["my-org-access"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.access_token) return null;
      return fn();
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const organizations = useMemo<OrganizationOption[]>(
    () =>
      ((data?.organizations ?? []) as OrgSummary[]).map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        role: o.role,
        modules: o.modules,
        logoUrl: o.logoUrl ?? null,
        brandColor: o.brandColor ?? null,
      })),
    [data],
  );

  // Valida a empresa persistida; se o usuário não pertence mais, escolhe uma válida.
  const activeOrganization = useMemo(() => {
    if (organizations.length === 0) return null;
    return organizations.find((o) => o.id === selectedId) ?? organizations[0]!;
  }, [organizations, selectedId]);

  useEffect(() => {
    if (!activeOrganization) return;
    if (activeOrganization.id !== selectedId) setSelectedId(activeOrganization.id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, activeOrganization.id);
  }, [activeOrganization, selectedId]);

  const setActiveOrganization = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      setSelectedId(id);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
      // Troca de empresa refaz todas as telas dependentes de dados da empresa.
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "my-org-access" });
    },
    [qc, selectedId],
  );

  const value: WorkspaceContextValue = {
    organizations,
    workspaces: organizations,
    activeOrganization,
    activeOrganizationId: activeOrganization?.id ?? null,
    activeWorkspace: activeOrganization,
    activeWorkspaceId: activeOrganization?.id ?? null,
    role: activeOrganization?.role ?? null,
    isSuperAdmin: !!data?.isSuperAdmin,
    setActiveOrganization,
    setActiveWorkspace: setActiveOrganization,
    isLoading,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  return useContext(Ctx);
}

export const useOrganization = useWorkspace;
