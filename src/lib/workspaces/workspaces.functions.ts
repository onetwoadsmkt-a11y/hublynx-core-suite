import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Workspace, WorkspaceAccess, WorkspaceMembership } from "./types";

/**
 * Lista os workspaces (empresas) do usuário autenticado.
 * A identidade vem SEMPRE do token validado pelo middleware (context.userId),
 * nunca de dados enviados pela interface.
 */
export const listMyWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceAccess> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Tabelas ainda não presentes nos tipos gerados; acesso não tipado.
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => any;
    };

    const { data: members, error } = await admin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    const memberships = (members ?? []) as WorkspaceMembership[];
    const ids = memberships.map((m) => m.workspace_id);
    if (ids.length === 0) return { workspaces: [], memberships: [] };

    const { data: rows, error: werr } = await admin
      .from("workspaces")
      .select("id, name, slug, active")
      .in("id", ids)
      .order("name");
    if (werr) throw new Error(werr.message);

    const workspaces = ((rows ?? []) as Workspace[]).filter((w) => w.active !== false);
    return { workspaces, memberships };
  });
