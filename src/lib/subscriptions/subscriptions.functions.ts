import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { subscriberSchema, withModuleDependencies } from "@/lib/org/access-rules";
import { ALL_CAPABILITIES, type Capability } from "./capabilities";

export type MyAccess = {
  isAdmin: boolean;
  status: string;
  capabilities: Capability[];
  plan: string | null;
  accountName: string | null;
};

async function isAdminUser(supabase: any, userId: string) {
  const { data: platform, error: platformError } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (platformError) throw new Error("Não foi possível verificar administração da plataforma.");
  if (platform) return true;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Não foi possível verificar administração.");
  return !!data;
}

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAccess> => {
    const { supabase, userId } = context;
    const admin = await isAdminUser(supabase, userId);
    const { data, error: accessError } = await supabase
      .from("subscriptions")
      .select("plan, status, capabilities, account_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (accessError) throw new Error("Não foi possível carregar assinatura.");
    if (admin) {
      return {
        isAdmin: admin,
        status: data?.status ?? "ativo",
        capabilities: ALL_CAPABILITIES,
        plan: data?.plan ?? null,
        accountName: data?.account_name ?? null,
      };
    }
    if (!data) return { isAdmin: false, status: "pendente", capabilities: [], plan: null, accountName: null };
    const active = data.status === "ativo" || data.status === "trial";
    return {
      isAdmin: false,
      status: data.status,
      capabilities: active ? ((data.capabilities ?? []) as Capability[]) : [],
      plan: data.plan,
      accountName: data.account_name,
    };
  });

export const listSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const ids = list.users.map((u) => u.id);
    const [{ data: subs }, { data: profiles }, { data: leads }] = await Promise.all([
      supabaseAdmin.from("subscriptions").select("*").in("user_id", ids),
      supabaseAdmin.from("profiles").select("id, full_name").in("id", ids),
      supabaseAdmin.from("leads").select("owner_id").in("owner_id", ids),
    ]);
    return list.users.map((u) => {
      const sub = subs?.find((s) => s.user_id === u.id) ?? null;
      return {
        userId: u.id,
        email: u.email ?? "",
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        fullName: profiles?.find((p) => p.id === u.id)?.full_name ?? null,
        leads: (leads ?? []).filter((l) => l.owner_id === u.id).length,
        subscription: sub,
      };
    });
  });

export const upsertSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      userId: string;
      accountName: string;
      plan: string;
      status: string;
      priceMonthly: number;
      capabilities: string[];
      currentPeriodEnd?: string | null;
      notes?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: data.userId,
        account_name: data.accountName,
        plan: data.plan,
        status: data.status,
        price_monthly: data.priceMonthly,
        capabilities: data.capabilities,
        current_period_end: data.currentPeriodEnd || null,
        notes: data.notes ?? null,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => subscriberSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (table: string) => any; auth: typeof supabaseAdmin.auth };
    const codes = withModuleDependencies(data.moduleCodes);
    const { data: modules, error: moduleError } = await db.from("modules").select("id, code").eq("active", true).in("code", codes);
    if (moduleError || (modules ?? []).length !== codes.length) throw new Error("Confira os módulos disponíveis antes de criar a conta.");
    let organizationId = data.organizationId;
    if (organizationId) {
      const { data: org, error } = await db.from("organizations").select("id, status").eq("id", organizationId).single();
      if (error || !org || !["active", "trial"].includes(org.status)) throw new Error("Empresa indisponível para novos usuários.");
      const { data: contracted, error: contractError } = await db.from("organization_modules").select("module_id").eq("organization_id", organizationId).eq("enabled", true);
      if (contractError || (modules ?? []).some((m: any) => !(contracted ?? []).some((c: any) => c.module_id === m.id))) throw new Error("Selecione apenas módulos contratados pela empresa.");
    }
    const { data: created, error } = await db.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: { full_name: data.accountName },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Não foi possível criar a conta.");
    const userId = created.user.id;
    let newOrgId: string | null = null;
    try {
      if (!organizationId) {
        const { data: org, error: orgError } = await db.from("organizations").insert({ name: data.organizationName, status: "active" }).select("id").single();
        if (orgError || !org) throw new Error("Não foi possível criar a empresa.");
        organizationId = org.id;
        newOrgId = org.id;
        if ((modules ?? []).length) {
          const { error: enableError } = await db.from("organization_modules").insert(modules.map((m: any) => ({ organization_id: organizationId, module_id: m.id, enabled: true })));
          if (enableError) throw new Error("Não foi possível cadastrar módulos da empresa.");
        }
      }
      const { error: memberError } = await db.from("organization_members").insert({ organization_id: organizationId, user_id: userId, role: data.role, status: "active" });
      if (memberError) throw new Error("Não foi possível vincular a conta à empresa.");
      if ((modules ?? []).length) {
        const { error: permissionError } = await db.from("user_module_permissions").insert(modules.map((m: any) => ({ organization_id: organizationId, user_id: userId, module_id: m.id, can_access: true })));
        if (permissionError) throw new Error("Não foi possível liberar as permissões da conta.");
      }
      const { error: subError } = await db.from("subscriptions").insert({
        user_id: userId, organization_id: organizationId, account_name: data.accountName,
        plan: data.plan, status: "ativo", price_monthly: data.priceMonthly, capabilities: data.capabilities,
      });
      if (subError) throw new Error("Não foi possível cadastrar a assinatura.");
      return { ok: true, userId };
    } catch (failure) {
      // Compensate only rows created by this request; never modify an existing company.
      const { error: cleanupUserError } = await db.auth.admin.deleteUser(userId);
      const cleanupOrg = newOrgId ? await db.from("organizations").delete().eq("id", newOrgId) : null;
      if (cleanupUserError || cleanupOrg?.error) throw new Error("Cadastro incompleto. Confira a conta na administração antes de tentar novamente.");
      throw failure;
    }
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; status: string }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: data.status })
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
