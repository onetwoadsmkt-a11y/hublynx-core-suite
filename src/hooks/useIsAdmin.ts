import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin() {
  const { data, isLoading } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data: platform, error: platformError } = await supabase.from("platform_admins" as any).select("user_id").eq("user_id", u.user.id).maybeSingle();
      if (platformError) throw platformError;
      if (platform) return true;
      const { data: rows, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) throw error;
      return !!rows;
    },
    staleTime: 5 * 60_000,
  });
  return { isAdmin: !!data, isLoading };
}
