import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrgSummary = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  role: string;
  /** Códigos de módulo habilitados para a organização E liberados para o usuário. */
  modules: string[];
};

export type OrgAccess = {
  isSuperAdmin: boolean;
  organizations: OrgSummary[];
};

/**
 * Acesso multi-tenant: organizações do usuário autenticado e módulos liberados
 * em cada uma. A identidade vem sempre do token validado pelo middleware.
 */
export const getMyOrgAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrgAccess> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as { from: (t: string) => any };
    const userId = context.userId;

    const { data: superRow } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    const isSuperAdmin = !!superRow;

    const { data: modRows } = await admin.from("modules").select("id, code, active");
    const moduleById = new Map<string, { code: string; active: boolean }>(
      ((modRows ?? []) as any[]).map((m) => [m.id as string, { code: m.code, active: m.active }]),
    );

    let orgRows: any[] = [];
    let roleByOrg = new Map<string, string>();

    if (isSuperAdmin) {
      const { data } = await admin.from("organizations").select("id, name, slug, status").order("name");
      orgRows = (data ?? []) as any[];
      for (const o of orgRows) roleByOrg.set(o.id, "super_admin");
    } else {
      const { data: members } = await admin
        .from("organization_members")
        .select("organization_id, role, status")
        .eq("user_id", userId)
        .eq("status", "active");
      const ids = ((members ?? []) as any[]).map((m) => m.organization_id as string);
      for (const m of (members ?? []) as any[]) roleByOrg.set(m.organization_id, m.role);
      if (ids.length === 0) return { isSuperAdmin, organizations: [] };
      const { data } = await admin
        .from("organizations")
        .select("id, name, slug, status")
        .in("id", ids)
        .order("name");
      orgRows = (data ?? []) as any[];
    }

    const orgIds = orgRows.map((o) => o.id as string);
    if (orgIds.length === 0) return { isSuperAdmin, organizations: [] };

    const { data: orgModules } = await admin
      .from("organization_modules")
      .select("organization_id, module_id, enabled")
      .in("organization_id", orgIds);

    const { data: perms } = await admin
      .from("user_module_permissions")
      .select("organization_id, module_id, can_access")
      .eq("user_id", userId)
      .in("organization_id", orgIds);

    const organizations: OrgSummary[] = orgRows.map((o) => {
      const role = roleByOrg.get(o.id) ?? "user";
      const isOrgAdmin = role === "super_admin" || role === "org_admin";
      const enabled = ((orgModules ?? []) as any[])
        .filter((m) => m.organization_id === o.id && m.enabled)
        .map((m) => moduleById.get(m.module_id))
        .filter((m): m is { code: string; active: boolean } => !!m && m.active)
        .map((m) => m.code);
      const allowed = isOrgAdmin
        ? enabled
        : enabled.filter((code) =>
            ((perms ?? []) as any[]).some(
              (p) =>
                p.organization_id === o.id &&
                p.can_access &&
                moduleById.get(p.module_id)?.code === code,
            ),
          );
      return {
        id: o.id,
        name: o.name,
        slug: o.slug ?? null,
        status: o.status ?? "active",
        role,
        modules: allowed,
      };
    });

    return { isSuperAdmin, organizations };
  });
