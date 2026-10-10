import { createServerFn } from "@tanstack/react-start";
import { effectiveModules } from "./access-rules";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrgSummary = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  role: string;
  /** Códigos de módulo habilitados para a organização E liberados para o usuário. */
  modules: string[];
  /** White label: logo da empresa (URL pública) e cor da marca (#RRGGBB). */
  logoUrl: string | null;
  brandColor: string | null;
};

export type OrgAccess = {
  isSuperAdmin: boolean;
  organizations: OrgSummary[];
};

const ORG_COLUMNS = "id, name, slug, status, logo_url, brand_color";

/**
 * Acesso multi-tenant: organizações do usuário autenticado e módulos liberados
 * em cada uma. A identidade vem sempre do token validado pelo middleware.
 */
export const getMyOrgAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrgAccess> => {
    const admin = context.supabase as unknown as { from: (t: string) => any };
    const userId = context.userId;

    const { data: superRow, error: superError } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (superError) throw new Error("Não foi possível verificar acesso à plataforma.");
    const isSuperAdmin = !!superRow;

    const { data: modRows, error: modError } = await admin.from("modules").select("id, code, active");
    if (modError) throw new Error("Não foi possível carregar módulos.");
    const moduleById = new Map<string, { code: string; active: boolean }>(
      ((modRows ?? []) as any[]).map((m) => [m.id as string, { code: m.code, active: m.active }]),
    );

    let orgRows: any[] = [];
    let roleByOrg = new Map<string, string>();

    if (isSuperAdmin) {
      const { data, error } = await admin.from("organizations").select(ORG_COLUMNS).order("name");
      if (error) throw new Error("Não foi possível carregar empresas.");
      orgRows = (data ?? []) as any[];
      for (const o of orgRows) roleByOrg.set(o.id, "super_admin");
    } else {
      const { data: members, error: memberError } = await admin
        .from("organization_members")
        .select("organization_id, role, status")
        .eq("user_id", userId)
        .eq("status", "active");
      if (memberError) throw new Error("Não foi possível carregar vínculos da conta.");
      const ids = ((members ?? []) as any[]).map((m) => m.organization_id as string);
      for (const m of (members ?? []) as any[]) roleByOrg.set(m.organization_id, m.role);
      if (ids.length === 0) return { isSuperAdmin, organizations: [] };
      const { data, error } = await admin
        .from("organizations")
        .select(ORG_COLUMNS)
        .in("id", ids)
        .order("name");
      if (error) throw new Error("Não foi possível carregar empresas.");
      orgRows = (data ?? []) as any[];
    }

    const orgIds = orgRows.map((o) => o.id as string);
    if (orgIds.length === 0) return { isSuperAdmin, organizations: [] };

    const { data: orgModules, error: orgModError } = await admin
      .from("organization_modules")
      .select("organization_id, module_id, enabled")
      .in("organization_id", orgIds);

    const { data: perms, error: permError } = await admin
      .from("user_module_permissions")
      .select("organization_id, module_id, can_access")
      .eq("user_id", userId)
      .in("organization_id", orgIds);

    if (orgModError || permError) throw new Error("Não foi possível carregar permissões da empresa.");
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
        modules: effectiveModules(o.status, enabled, role, allowed),
        logoUrl: o.logo_url ?? null,
        brandColor: o.brand_color ?? null,
      };
    });

    return { isSuperAdmin, organizations };
  });
