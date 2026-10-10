import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess } from "@/lib/subscriptions/subscriptions.functions";
import { useWorkspace } from "./useWorkspace";
import type { Capability } from "@/lib/subscriptions/capabilities";

export function useAccess() {
  const { activeOrganization, isSuperAdmin, isLoading: orgLoading } = useWorkspace();
  const fn = useServerFn(getMyAccess);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-access"],
    queryFn: async () => {
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error) throw error;

      // The authenticated layout can mount while the persisted session is still
      // hydrating. Do not call a protected server function until its bearer token
      // is available; the global function middleware will attach it to the RPC.
      if (!sessionData.session?.access_token) return null;
      return fn();
    },
    staleTime: 5 * 60_000,
    retry: (failureCount, error) =>
      failureCount < 1 && !error.message.toLowerCase().includes("unauthorized"),
  });
  const capabilities = (data?.capabilities ?? []) as Capability[];
  return {
    isLoading: isLoading || isError || data == null,
    isAdmin: isSuperAdmin || !!data?.isAdmin,
    status: data?.status ?? "ativo",
    accountName: data?.accountName ?? null,
    capabilities,
    can: (cap: Capability) => capabilities.includes(cap),
  };
}
