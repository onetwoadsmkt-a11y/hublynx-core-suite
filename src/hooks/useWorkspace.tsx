import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyOrgAccess, type OrgSummary } from "@/lib/org/org.functions";
import { trialHasExpired } from "@/lib/org/trial-rules";

const STORAGE_KEY = "hublynx-active-organization";
/** Cache legado apagado ao sair; a marca exibida vem da empresa validada. */
export const BRAND_CACHE_KEY = "hublynx-brand-cache";

export type BrandInfo = { logoUrl: string | null; brandColor: string | null };

export function clearBrandCache() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(BRAND_CACHE_KEY) || key.startsWith(STORAGE_KEY)) localStorage.removeItem(key);
    }
  } catch {
    /* ignora */
  }
}

export type OrganizationOption = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  trialExpiresAt: string | null;
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
  /** Marca da empresa ativa, após verificar o acesso da identidade atual. */
  brand: BrandInfo | null;
  setActiveOrganization: (id: string) => void;
  /** Alias legado. */
  setActiveWorkspace: (id: string) => void;
  isLoading: boolean;
  isError: boolean;
  retryAccess: () => void;
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
  brand: null,
  setActiveOrganization: () => {},
  setActiveWorkspace: () => {},
  isLoading: false,
  isError: false,
  retryAccess: () => {},
};

const Ctx = createContext<WorkspaceContextValue>(EMPTY);

export function WorkspaceProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(getMyOrgAccess);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(`${STORAGE_KEY}:${userId}`); } catch { return null; }
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-org-access", userId],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.access_token || s.session.user.id !== userId) throw new Error("Sessão indisponível. Entre novamente.");
      return fn();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const organizations = useMemo<OrganizationOption[]>(
    () =>
      ((data?.organizations ?? []) as OrgSummary[]).map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        trialExpiresAt: o.trialExpiresAt,
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
    const org = organizations.find((o) => o.id === selectedId) ?? organizations[0];
    if (!org) return null;
    return org.status === "trial" && trialHasExpired(org.trialExpiresAt)
      ? { ...org, status: "expired", modules: [] } : org;
  }, [organizations, selectedId]);



  useEffect(() => {
    if (!activeOrganization || typeof window === "undefined") return;
    try {
      localStorage.setItem(
        `${BRAND_CACHE_KEY}:${userId}`,
        JSON.stringify({ logoUrl: activeOrganization.logoUrl, brandColor: activeOrganization.brandColor }),
      );
    } catch {
      /* ignora */
    }
  }, [activeOrganization?.id, activeOrganization?.logoUrl, activeOrganization?.brandColor]);

  useEffect(() => {
    if (!activeOrganization) return;
    if (activeOrganization.id !== selectedId) setSelectedId(activeOrganization.id);
    if (typeof window !== "undefined") localStorage.setItem(`${STORAGE_KEY}:${userId}`, activeOrganization.id);
  }, [activeOrganization, selectedId]);

  const setActiveOrganization = useCallback(
    (id: string) => {
      if (id === selectedId || !organizations.some((org) => org.id === id)) return;
      setSelectedId(id);
      if (typeof window !== "undefined") localStorage.setItem(`${STORAGE_KEY}:${userId}`, id);
      // Troca de empresa refaz todas as telas dependentes de dados da empresa.
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "my-org-access" });
    },
    [qc, selectedId, userId, organizations],
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
    brand: activeOrganization
      ? { logoUrl: activeOrganization.logoUrl, brandColor: activeOrganization.brandColor }
      : null,
    setActiveOrganization,
    setActiveWorkspace: setActiveOrganization,
    isLoading,
    isError,
    retryAccess: () => { void refetch(); },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  return useContext(Ctx);
}

export const useOrganization = useWorkspace;
