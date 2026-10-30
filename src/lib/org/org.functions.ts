import { createServerFn } from "@tanstack/react-start";
import { effectiveModules } from "./access-rules";
import { trialHasExpired } from "./trial-rules";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrgSummary = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  trialExpiresAt: string | null;
  role: string;
  /** Códigos de módulo habilitados para a organização E liberados para o usuário. */
  modules: string[];
  /** Administrador da plataforma acessando uma empresa da qual não é membro (modo suporte). */
  support?: boolean;
  /** White label: logo da empresa (URL pública) e cor da marca (#RRGGBB). */
  logoUrl: string | null;
  brandColor: string | null;
  /** fundo do tema escuro: no tom da marca ou preto */
  darkStyle?: "marca" | "preto";
};

export type OrgAccess = {
  isSuperAdmin: boolean;
  organizations: OrgSummary[];
};

// Read optional trial column without breaking installations awaiting the trial SQL.
const ORG_COLUMNS = "*";

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

    const memberOf = new Set<string>();
    if (isSuperAdmin) {
      // lista todas as empresas pelo servidor (as regras do banco mostram só a empresa atendida)
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const sa = supabaseAdmin as unknown as { from: (t: string) => any };
      const { data, error } = await sa.from("organizations").select(ORG_COLUMNS).order("name");
      if (error) throw new Error("Não foi possível carregar empresas.");
      orgRows = (data ?? []) as any[];
      for (const o of orgRows) roleByOrg.set(o.id, "super_admin");
      const { data: mine } = await sa
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .eq("status", "active");
      for (const m of (mine ?? []) as any[]) memberOf.add(m.organization_id);
    } else {
      const { data: members, error: memberError } = await admin
        .from("organization_members")
        .select("organization_id, role, status")
        .eq("user_id", userId)
        .eq("status", "active");
      if (memberError) throw new Error("Não foi possível carregar vínculos da conta.");
      let memberRows = (members ?? []) as any[];
      // conta criada pelo próprio usuário e ainda sem empresa: libera o teste na hora
      if (memberRows.length === 0) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { ensureSelfServiceWorkspace } = await import("./self-service.server");
        const r = await ensureSelfServiceWorkspace(supabaseAdmin as any, userId).catch(() => ({ created: false }));
        if (r.created) {
          const again = await admin
            .from("organization_members")
            .select("organization_id, role, status")
            .eq("user_id", userId)
            .eq("status", "active");
          memberRows = (again.data ?? []) as any[];
        }
      }
      const ids = memberRows.map((m) => m.organization_id as string);
      for (const m of memberRows) roleByOrg.set(m.organization_id, m.role);
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

    const reader = isSuperAdmin
      ? ((await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as { from: (t: string) => any })
      : admin;
    // fundo do tema escuro (migração 31); antes dela a coluna não existe e fica "marca"
    const darkStyle = new Map<string, string>();
    try {
      const { data: ds, error: dsErr } = await reader.from("organizations").select("id, dark_style").in("id", orgIds);
      if (!dsErr) for (const r of (ds ?? []) as any[]) if (r.dark_style) darkStyle.set(r.id, r.dark_style);
    } catch {
      /* sem a coluna */
    }
    const { data: orgModules, error: orgModError } = await reader
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
      const status = o.status === "trial" && trialHasExpired(o.trial_expires_at) ? "expired" : o.status;
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
        status: status ?? "active",
        trialExpiresAt: o.trial_expires_at ?? null,
        role,
        modules: effectiveModules(status, enabled, role, allowed),
        logoUrl: o.logo_url ?? null,
        brandColor: o.brand_color ?? null,
        darkStyle: darkStyle.get(o.id) === "preto" ? "preto" : "marca",
        support: isSuperAdmin && !memberOf.has(o.id),
      };
    });

    // Quem é equipe em alguma empresa não vê, no painel, as empresas onde é só cliente (portal).
    const staffOrgs = organizations.filter((o) => o.role !== "guest");
    return { isSuperAdmin, organizations: staffOrgs.length ? staffOrgs : organizations };
  });
