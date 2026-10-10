import { createServerFn } from "@tanstack/react-start";
import { ORG_MODULE_DEPENDS_ON, type OrgModuleCode } from "@/lib/org/modules-map";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Central Administrativa (Etapas 4 e 5). Tudo exige administrador da plataforma. */

const uuid = z.string().uuid();

async function adminDb(supabase: any, userId: string) {
  const { data: superRow, error: superError } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (superError) throw new Error("Não foi possível verificar administração da plataforma.");
  if (!superRow) {
    // Compatibility only until existing platform administrators are audited.
    const { data: roleRow, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (error || !roleRow) throw new Error("Acesso restrito à administração da plataforma.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any; auth: any };
}

// ---------------------------------------------------------------- empresas

export type AdminOrg = {
  id: string;
  name: string;
  slug: string | null;
  document: string | null;
  responsible_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  contracted_users: number;
  modules: string[];
  members: number;
  storage_mb: number;
  database_mb: number;
};

export type ModuleRow = { id: string; code: string; name: string; active: boolean };

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ organizations: AdminOrg[]; modules: ModuleRow[] }> => {
    const db = await adminDb(context.supabase, context.userId);

    const [{ data: orgs }, { data: mods }, { data: orgMods }, { data: members }, { data: usage }] =
      await Promise.all([
        db.from("organizations").select("*").order("name"),
        db.from("modules").select("id, code, name, active").order("sort_order"),
        db.from("organization_modules").select("organization_id, module_id, enabled"),
        db.from("organization_members").select("organization_id, status"),
        db.from("organization_usage").select("organization_id, storage_mb, database_mb, measured_at"),
      ]);

    const modById = new Map<string, ModuleRow>(((mods ?? []) as any[]).map((m) => [m.id, m]));
    const latest = new Map<string, any>();
    for (const u of ((usage ?? []) as any[]).sort(
      (a, b) => +new Date(a.measured_at) - +new Date(b.measured_at),
    )) {
      latest.set(u.organization_id, u);
    }

    const organizations: AdminOrg[] = ((orgs ?? []) as any[]).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug ?? null,
      document: o.document ?? null,
      responsible_name: o.responsible_name ?? null,
      email: o.email ?? null,
      phone: o.phone ?? null,
      status: o.status ?? "active",
      contracted_users: o.contracted_users ?? 0,
      modules: ((orgMods ?? []) as any[])
        .filter((m) => m.organization_id === o.id && m.enabled)
        .map((m) => modById.get(m.module_id)?.code)
        .filter(Boolean) as string[],
      members: ((members ?? []) as any[]).filter(
        (m) => m.organization_id === o.id && m.status === "active",
      ).length,
      storage_mb: Number(latest.get(o.id)?.storage_mb ?? 0),
      database_mb: Number(latest.get(o.id)?.database_mb ?? 0),
    }));

    return { organizations, modules: (mods ?? []) as ModuleRow[] };
  });

export const saveOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        name: z.string().trim().min(1).max(160),
        slug: z.string().trim().max(80).nullable().optional(),
        document: z.string().trim().max(40).nullable().optional(),
        responsible_name: z.string().trim().max(160).nullable().optional(),
        email: z.string().trim().max(160).nullable().optional(),
        phone: z.string().trim().max(40).nullable().optional(),
        status: z.enum(["active", "suspended", "cancelled", "trial"]).default("active"),
        contracted_users: z.number().int().min(1).max(5000).default(3),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb(context.supabase, context.userId);
    const payload = {
      name: data.name,
      slug: data.slug || null,
      document: data.document || null,
      responsible_name: data.responsible_name || null,
      email: data.email || null,
      phone: data.phone || null,
      status: data.status,
      contracted_users: data.contracted_users,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await db.from("organizations").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await db
      .from("organizations")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const setOrganizationModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organization_id: uuid, module_id: uuid, enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb(context.supabase, context.userId);
    // Dependências: Projetos precisa de Tarefas; Fiscal precisa de Financeiro.
    const { data: mods } = await db.from("modules").select("id, code");
    const idByCode = new Map<string, string>(((mods ?? []) as any[]).map((m) => [m.code, m.id]));
    const codeById = new Map<string, string>(((mods ?? []) as any[]).map((m) => [m.id, m.code]));
    const code = codeById.get(data.module_id) as OrgModuleCode | undefined;
    const affected = new Set<string>([data.module_id]);
    if (code && data.enabled) {
      for (const dep of ORG_MODULE_DEPENDS_ON[code] ?? []) {
        const id = idByCode.get(dep);
        if (id) affected.add(id);
      }
    } else if (code && !data.enabled) {
      for (const [parent, deps] of Object.entries(ORG_MODULE_DEPENDS_ON)) {
        const id = idByCode.get(parent);
        if (id && deps?.includes(code)) affected.add(id);
      }
    }
    const now = new Date().toISOString();
    const { error } = await db.from("organization_modules").upsert(
      [...affected].map((module_id) => ({
        organization_id: data.organization_id,
        module_id,
        enabled: data.enabled,
        deactivated_at: data.enabled ? null : now,
      })),
      { onConflict: "organization_id,module_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------- usuários

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  last_sign_in_at: string | null;
  memberships: { organization_id: string; organization: string; role: string; status: string }[];
  is_platform_admin: boolean;
};

export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    const db = await adminDb(context.supabase, context.userId);
    const { data: list, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);

    const [{ data: members }, { data: orgs }, { data: admins }] = await Promise.all([
      db.from("organization_members").select("organization_id, user_id, role, status"),
      db.from("organizations").select("id, name"),
      db.from("platform_admins").select("user_id"),
    ]);
    const orgName = new Map<string, string>(((orgs ?? []) as any[]).map((o) => [o.id, o.name]));
    const adminIds = new Set(((admins ?? []) as any[]).map((a) => a.user_id));

    return (list?.users ?? []).map((u: any) => ({
      user_id: u.id,
      email: u.email ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      is_platform_admin: adminIds.has(u.id),
      memberships: ((members ?? []) as any[])
        .filter((m) => m.user_id === u.id)
        .map((m) => ({
          organization_id: m.organization_id,
          organization: orgName.get(m.organization_id) ?? "—",
          role: m.role,
          status: m.status,
        })),
    }));
  });

export const setOrgMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organization_id: uuid,
        user_id: uuid,
        role: z.enum(["org_admin", "user", "guest"]).default("user"),
        status: z.enum(["active", "inactive", "invited"]).default("active"),
        remove: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb(context.supabase, context.userId);
    if (data.remove) {
      const { error } = await db
        .from("organization_members")
        .delete()
        .eq("organization_id", data.organization_id)
        .eq("user_id", data.user_id);
      if (error) throw new Error(error.message);
      return { ok: true as const };
    }
    const { error } = await db.from("organization_members").upsert(
      {
        organization_id: data.organization_id,
        user_id: data.user_id,
        role: data.role,
        status: data.status,
      },
      { onConflict: "organization_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------- preços

export type PricingMap = Record<string, number>;

export const getPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ pricing: PricingMap; history: any[] }> => {
    const db = await adminDb(context.supabase, context.userId);
    const { data, error } = await db
      .from("pricing_config")
      .select("id, key, value, active, valid_from, note")
      .order("valid_from", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const pricing: PricingMap = {};
    for (const r of rows) if (r.active && pricing[r.key] === undefined) pricing[r.key] = Number(r.value);
    return { pricing, history: rows.slice(0, 40) };
  });

export const savePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entries: z.array(z.object({ key: z.string().min(1), value: z.number().min(0) })).min(1),
        note: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb(context.supabase, context.userId);
    for (const e of data.entries) {
      await db.from("pricing_config").update({ active: false }).eq("key", e.key).eq("active", true);
      const { error } = await db.from("pricing_config").insert({
        key: e.key,
        value: e.value,
        note: data.note ?? null,
        changed_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

// ---------------------------------------------------------------- faixas

export type Tier = {
  id: string;
  name: string | null;
  min_users: number;
  max_users: number | null;
  database_limit_mb: number;
  storage_limit_mb: number;
  custom: boolean;
  active: boolean;
};

export const listTiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Tier[]> => {
    const db = await adminDb(context.supabase, context.userId);
    const { data, error } = await db
      .from("resource_tiers")
      .select("id, name, min_users, max_users, database_limit_mb, storage_limit_mb, custom, active")
      .order("min_users");
    if (error) throw new Error(error.message);
    return (data ?? []) as Tier[];
  });

export const saveTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        name: z.string().trim().max(120).nullable().optional(),
        min_users: z.number().int().min(1),
        max_users: z.number().int().min(1).nullable().optional(),
        database_limit_mb: z.number().int().min(0),
        storage_limit_mb: z.number().int().min(0),
        custom: z.boolean().default(false),
        active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb(context.supabase, context.userId);
    const payload = {
      name: data.name || null,
      min_users: data.min_users,
      max_users: data.max_users ?? null,
      database_limit_mb: data.database_limit_mb,
      storage_limit_mb: data.storage_limit_mb,
      custom: data.custom,
      active: data.active,
    };
    if (data.id) {
      const { error } = await db.from("resource_tiers").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await db
      .from("resource_tiers")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const deleteTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminDb(context.supabase, context.userId);
    const { error } = await db.from("resource_tiers").update({ active: false }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------- simulador

export type Simulation = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  modules: string[];
  total_users: number;
  module_total: number;
  additional_users: number;
  user_total: number;
  monthly_total: number;
  annual_total: number;
  database_limit_mb: number | null;
  storage_limit_mb: number | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export const listSimulations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Simulation[]> => {
    const db = await adminDb(context.supabase, context.userId);
    const { data, error } = await db
      .from("commercial_simulations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as Simulation[];
  });

export const saveSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        company_name: z.string().trim().min(1).max(160),
        contact_name: z.string().trim().max(160).nullable().optional(),
        email: z.string().trim().max(160).nullable().optional(),
        phone: z.string().trim().max(40).nullable().optional(),
        modules: z.array(z.string()).default([]),
        total_users: z.number().int().min(1).max(5000),
        module_total: z.number().min(0),
        additional_users: z.number().int().min(0),
        user_total: z.number().min(0),
        monthly_total: z.number().min(0),
        annual_total: z.number().min(0),
        database_limit_mb: z.number().int().nullable().optional(),
        storage_limit_mb: z.number().int().nullable().optional(),
        pricing_snapshot: z.record(z.string(), z.number()).default({}),
        notes: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb(context.supabase, context.userId);
    const { data: created, error } = await db
      .from("commercial_simulations")
      .insert({ ...data, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const setSimulationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        status: z.enum(["open", "proposal", "approved", "converted", "lost"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb(context.supabase, context.userId);
    const { error } = await db
      .from("commercial_simulations")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------- utilização

export type OrgUsage = {
  organization_id: string;
  organization: string;
  users_count: number;
  contracted_users: number;
  storage_mb: number;
  database_mb: number;
  storage_limit_mb: number | null;
  database_limit_mb: number | null;
  tier: string | null;
  measured_at: string | null;
};

const COUNT_TABLES = [
  "leads",
  "clients",
  "projects",
  "tasks",
  "finances",
  "lead_notes",
  "lead_events",
  "project_stages",
];

/** Recalcula utilização (usuários, arquivos e estimativa de banco) de todas as empresas. */
export const recalcUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb(context.supabase, context.userId);
    const { data: orgs } = await db.from("organizations").select("id");
    const ids = ((orgs ?? []) as any[]).map((o) => o.id as string);

    for (const orgId of ids) {
      const { count: users } = await db
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "active");

      let bytes = 0;
      for (const table of ["files", "lead_files"]) {
        const { data: rows } = await db
          .from(table)
          .select("size_bytes")
          .eq("organization_id", orgId)
          .limit(10000);
        for (const r of (rows ?? []) as any[]) bytes += Number(r.size_bytes ?? 0);
      }

      let rowsTotal = 0;
      for (const table of COUNT_TABLES) {
        const { count } = await db
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId);
        rowsTotal += count ?? 0;
      }

      await db.from("organization_usage").insert({
        organization_id: orgId,
        users_count: users ?? 0,
        storage_mb: Number((bytes / (1024 * 1024)).toFixed(2)),
        // estimativa: ~4 KB por registro de negócio
        database_mb: Number(((rowsTotal * 4096) / (1024 * 1024)).toFixed(2)),
      });
    }
    return { ok: true as const, organizations: ids.length };
  });

export const listUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrgUsage[]> => {
    const db = await adminDb(context.supabase, context.userId);
    const [{ data: orgs }, { data: usage }, { data: tiers }] = await Promise.all([
      db.from("organizations").select("id, name, contracted_users").order("name"),
      db
        .from("organization_usage")
        .select("organization_id, users_count, storage_mb, database_mb, measured_at")
        .order("measured_at", { ascending: false })
        .limit(500),
      db.from("resource_tiers").select("*").eq("active", true).order("min_users"),
    ]);

    const latest = new Map<string, any>();
    for (const u of (usage ?? []) as any[]) if (!latest.has(u.organization_id)) latest.set(u.organization_id, u);

    return ((orgs ?? []) as any[]).map((o) => {
      const u = latest.get(o.id);
      const users = Number(u?.users_count ?? 0) || Number(o.contracted_users ?? 0);
      const tier = ((tiers ?? []) as any[]).find(
        (t) => users >= t.min_users && (t.max_users == null || users <= t.max_users),
      );
      return {
        organization_id: o.id,
        organization: o.name,
        users_count: Number(u?.users_count ?? 0),
        contracted_users: Number(o.contracted_users ?? 0),
        storage_mb: Number(u?.storage_mb ?? 0),
        database_mb: Number(u?.database_mb ?? 0),
        storage_limit_mb: tier?.storage_limit_mb ?? null,
        database_limit_mb: tier?.database_limit_mb ?? null,
        tier: tier?.name ?? null,
        measured_at: u?.measured_at ?? null,
      };
    });
  });

// ---------------------------------------------------------------- dashboard

export type PlatformOverview = {
  organizations: number;
  activeOrganizations: number;
  users: number;
  mrr: number;
  simulationsOpen: number;
  byModule: { code: string; name: string; organizations: number }[];
  storageTotalMb: number;
};

export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformOverview> => {
    const db = await adminDb(context.supabase, context.userId);
    const [{ data: orgs }, { data: mods }, { data: orgMods }, { data: members }, { data: pricing }, { data: sims }, { data: usage }] =
      await Promise.all([
        db.from("organizations").select("id, status, contracted_users"),
        db.from("modules").select("id, code, name"),
        db.from("organization_modules").select("organization_id, module_id, enabled"),
        db.from("organization_members").select("user_id, status"),
        db.from("pricing_config").select("key, value, active, valid_from").order("valid_from", { ascending: false }),
        db.from("commercial_simulations").select("id, status"),
        db.from("organization_usage").select("organization_id, storage_mb, measured_at").order("measured_at", { ascending: false }).limit(500),
      ]);

    const price: Record<string, number> = {};
    for (const p of (pricing ?? []) as any[]) if (p.active && price[p.key] === undefined) price[p.key] = Number(p.value);

    const modById = new Map<string, any>(((mods ?? []) as any[]).map((m) => [m.id, m]));
    const enabled = ((orgMods ?? []) as any[]).filter((m) => m.enabled);

    let mrr = 0;
    for (const o of (orgs ?? []) as any[]) {
      if (o.status !== "active" && o.status !== "trial") continue;
      const codes = enabled
        .filter((m) => m.organization_id === o.id)
        .map((m) => modById.get(m.module_id)?.code);
      if (codes.includes("crm")) mrr += price["crm_monthly_price"] ?? 0;
      if (codes.includes("projects")) mrr += price["projects_monthly_price"] ?? 0;
      const extra = Math.max(0, (o.contracted_users ?? 0) - (price["included_users"] ?? 0));
      mrr += extra * (price["additional_user_price"] ?? 0);
    }

    const latest = new Map<string, number>();
    for (const u of (usage ?? []) as any[]) if (!latest.has(u.organization_id)) latest.set(u.organization_id, Number(u.storage_mb ?? 0));

    return {
      organizations: ((orgs ?? []) as any[]).length,
      activeOrganizations: ((orgs ?? []) as any[]).filter((o) => o.status === "active").length,
      users: new Set(((members ?? []) as any[]).filter((m) => m.status === "active").map((m) => m.user_id)).size,
      mrr,
      simulationsOpen: ((sims ?? []) as any[]).filter((s) => s.status === "open" || s.status === "proposal").length,
      byModule: ((mods ?? []) as any[]).map((m) => ({
        code: m.code,
        name: m.name,
        organizations: enabled.filter((e) => e.module_id === m.id).length,
      })),
      storageTotalMb: [...latest.values()].reduce((a, b) => a + b, 0),
    };
  });

// ------------------------------------------------ usuários por empresa

export type OrgMemberRow = {
  user_id: string;
  email: string | null;
  role: string;
  status: string;
  /** Ids dos módulos liberados individualmente para o usuário nesta empresa. */
  module_ids: string[];
};

export const listOrgMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organization_id: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<OrgMemberRow[]> => {
    const db = await adminDb(context.supabase, context.userId);

    const [{ data: members }, { data: perms }, users] = await Promise.all([
      db
        .from("organization_members")
        .select("user_id, role, status")
        .eq("organization_id", data.organization_id),
      db
        .from("user_module_permissions")
        .select("user_id, module_id, can_access")
        .eq("organization_id", data.organization_id),
      db.auth.admin.listUsers({ page: 1, perPage: 500 }),
    ]);

    const emailById = new Map<string, string | null>(
      ((users?.data?.users ?? []) as any[]).map((u) => [u.id, u.email ?? null]),
    );

    return ((members ?? []) as any[]).map((m) => ({
      user_id: m.user_id,
      email: emailById.get(m.user_id) ?? null,
      role: m.role ?? "user",
      status: m.status ?? "active",
      module_ids: ((perms ?? []) as any[])
        .filter((p) => p.user_id === m.user_id && p.can_access)
        .map((p) => p.module_id as string),
    }));
  });

export const addOrgMemberByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organization_id: uuid,
        email: z.string().trim().email().max(160),
        role: z.enum(["org_admin", "user", "guest"]).default("user"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb(context.supabase, context.userId);
    const { data: list, error } = await db.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (error) throw new Error(error.message);
    const target = ((list?.users ?? []) as any[]).find(
      (u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
    );
    if (!target) throw new Error("Nenhum usuário cadastrado com esse e-mail.");

    const { error: upErr } = await db.from("organization_members").upsert(
      {
        organization_id: data.organization_id,
        user_id: target.id,
        role: data.role,
        status: "active",
      },
      { onConflict: "organization_id,user_id" },
    );
    if (upErr) throw new Error(upErr.message);
    return { user_id: target.id as string };
  });

export const setUserModulePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organization_id: uuid,
        user_id: uuid,
        module_id: uuid,
        can_access: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb(context.supabase, context.userId);

    const { data: member, error: memberError } = await db.from("organization_members").select("user_id").eq("organization_id", data.organization_id).eq("user_id", data.user_id).eq("status", "active").maybeSingle();
    if (memberError || !member) throw new Error("Usuário não é membro ativo desta empresa.");
    // Só é possível liberar módulos que a empresa realmente contratou.
    if (data.can_access) {
      const { data: contracted } = await db
        .from("organization_modules")
        .select("enabled")
        .eq("organization_id", data.organization_id)
        .eq("module_id", data.module_id)
        .maybeSingle();
      if (!contracted?.enabled) throw new Error("Módulo não contratado por esta empresa.");
    }

    const { error } = await db.from("user_module_permissions").upsert(
      {
        organization_id: data.organization_id,
        user_id: data.user_id,
        module_id: data.module_id,
        can_access: data.can_access,
      },
      { onConflict: "organization_id,user_id,module_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
