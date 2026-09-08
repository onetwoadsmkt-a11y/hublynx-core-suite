import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMyWorkspaces } from "@/lib/workspaces/workspaces.functions";
import type { Workspace, WorkspaceMembership } from "@/lib/workspaces/types";

const STORAGE_KEY = "hublynx-active-workspace";

type WorkspaceContextValue = {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  activeWorkspaceId: string | null;
  membership: WorkspaceMembership | null;
  role: string | null;
  setActiveWorkspace: (id: string) => void;
  isLoading: boolean;
};

const Ctx = createContext<WorkspaceContextValue>({
  workspaces: [],
  activeWorkspace: null,
  activeWorkspaceId: null,
  membership: null,
  role: null,
  setActiveWorkspace: () => {},
  isLoading: true,
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const fn = useServerFn(listMyWorkspaces);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  const { data, isLoading } = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.access_token) return null;
      return fn();
    },
    staleTime: 10 * 60_000,
  });

  const workspaces = useMemo(() => data?.workspaces ?? [], [data]);
  const memberships = useMemo(() => data?.memberships ?? [], [data]);

  // Valida o workspace persistido; se o usuário não pertence mais, escolhe um válido.
  const activeWorkspace = useMemo(() => {
    if (workspaces.length === 0) return null;
    return workspaces.find((w) => w.id === selectedId) ?? workspaces[0]!;
  }, [workspaces, selectedId]);

  useEffect(() => {
    if (!activeWorkspace) return;
    if (activeWorkspace.id !== selectedId) setSelectedId(activeWorkspace.id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, activeWorkspace.id);
  }, [activeWorkspace, selectedId]);

  const setActiveWorkspace = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      setSelectedId(id);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
      // Refaz apenas as consultas dependentes do workspace.
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["all-leads"] });
      qc.invalidateQueries({ queryKey: ["pipeline-dashboard"] });
      qc.invalidateQueries({ queryKey: ["lead-detail"] });
    },
    [qc, selectedId],
  );

  const membership = useMemo(
    () => memberships.find((m) => m.workspace_id === activeWorkspace?.id) ?? null,
    [memberships, activeWorkspace],
  );

  const value: WorkspaceContextValue = {
    workspaces,
    activeWorkspace,
    activeWorkspaceId: activeWorkspace?.id ?? null,
    membership,
    role: membership?.role ?? null,
    setActiveWorkspace,
    isLoading,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  return useContext(Ctx);
}
