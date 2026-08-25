import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess } from "@/lib/subscriptions/subscriptions.functions";
import { ALL_CAPABILITIES, type Capability } from "@/lib/subscriptions/capabilities";

export function useAccess() {
  const fn = useServerFn(getMyAccess);
  const { data, isLoading } = useQuery({
    queryKey: ["my-access"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });
  const capabilities = (data?.capabilities ?? ALL_CAPABILITIES) as Capability[];
  return {
    isLoading,
    isAdmin: !!data?.isAdmin,
    status: data?.status ?? "ativo",
    accountName: data?.accountName ?? null,
    capabilities,
    can: (cap: Capability) => capabilities.includes(cap),
  };
}
