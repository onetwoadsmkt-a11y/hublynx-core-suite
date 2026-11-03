import { useQuery } from "@tanstack/react-query";
import { FORM_ORIGIN } from "@/lib/forms/form-domain";

/**
 * Endereço usado nos links dos formulários: form.hublynx.com.br quando o domínio já
 * aponta para o Core; senão, o próprio endereço do Core (o link nunca sai quebrado).
 */
export function useFormOrigin() {
  const here = typeof window !== "undefined" ? window.location.origin : "";
  const q = useQuery({
    queryKey: ["form-domain-live"],
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const r = await fetch(`${FORM_ORIGIN}/api/public/forms-host`, { cache: "no-store" });
        if (!r.ok) return false;
        const j = (await r.json()) as { app?: string };
        return j.app === "core-suite";
      } catch {
        return false;
      }
    },
  });
  return { origin: q.data ? FORM_ORIGIN : here, live: !!q.data };
}
