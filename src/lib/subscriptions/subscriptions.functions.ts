import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { subscriberSchema, withModuleDependencies } from "@/lib/org/access-rules";
import { trialEndsAt, trialHasExpired } from "@/lib/org/trial-rules";
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
      .select("plan, status, capabilities, account_name, created_at")
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
    const expired = data.plan === "teste_14_dias" && data.status === "trial" && trialHasExpired(trialEndsAt(data.created_at));
    const active = !expired && (data.status === "ativo" || data.status === "trial");
    return {
      isAdmin: false,
      status: expired ? "expirado" : data.status,
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
      app_metadata: { account_provisioning: "administrative" },
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

// ---------------------------------------------------------------------------
// Inativar / reativar / excluir conta de assinante (Central de Assinaturas)
//
// Inativar: assinatura "cancelado", login bloqueado (ban no Supabase Auth) e as empresas
// das quais a conta é dona ficam "suspended" (todo mundo dessas empresas vê "Acesso da
// empresa suspenso"). Reativar desfaz tudo. Excluir é definitivo e só vale para conta
// já inativada, com o e-mail digitado para confirmar.

const HUBLYNX_ORG = "2d4ce02e-5e15-4b0d-8192-0ca9a63aff1f";
const BAN_FOREVER = "876000h"; // ~100 anos

async function guardTarget(admin: any, callerId: string, userId: string) {
  if (userId === callerId) throw new Error("Você não pode inativar ou excluir a sua própria conta.");
  const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (pa) throw new Error("Esta conta é administradora da plataforma e não pode ser inativada ou excluída aqui.");
  const { data: hub } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", HUBLYNX_ORG)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (hub) throw new Error("Esta conta é da equipe da Hublynx. Tire a pessoa da equipe antes.");
}

async function ownedOrgs(admin: any, userId: string) {
  const { data } = await admin
    .from("organizations")
    .select("id, name, status")
    .eq("legacy_owner_id", userId)
    .neq("id", HUBLYNX_ORG);
  return (data ?? []) as { id: string; name: string; status: string }[];
}

export const deactivateSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    await guardTarget(admin, context.userId, data.userId);

    const { error: banErr } = await admin.auth.admin.updateUserById(data.userId, { ban_duration: BAN_FOREVER });
    if (banErr) throw new Error(`Não foi possível bloquear o login: ${banErr.message}`);
    await admin.from("subscriptions").update({ status: "cancelado" }).eq("user_id", data.userId);
    const orgs = await ownedOrgs(admin, data.userId);
    const toSuspend = orgs.filter((o) => o.status === "active" || o.status === "trial").map((o) => o.id);
    if (toSuspend.length) await admin.from("organizations").update({ status: "suspended" }).in("id", toSuspend);
    return { ok: true, suspendedCompanies: toSuspend.length };
  });

export const reactivateSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { error: unbanErr } = await admin.auth.admin.updateUserById(data.userId, { ban_duration: "none" });
    if (unbanErr) throw new Error(`Não foi possível liberar o login: ${unbanErr.message}`);
    const { data: sub } = await admin.from("subscriptions").select("plan").eq("user_id", data.userId).maybeSingle();
    const isTrial = sub?.plan === "teste_14_dias";
    await admin.from("subscriptions").update({ status: isTrial ? "trial" : "ativo" }).eq("user_id", data.userId);
    const orgs = await ownedOrgs(admin, data.userId);
    const suspended = orgs.filter((o) => o.status === "suspended").map((o) => o.id);
    if (suspended.length) {
      await admin.from("organizations").update({ status: isTrial ? "trial" : "active" }).in("id", suspended);
    }
    return { ok: true };
  });

export const deleteSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; confirmEmail: string }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    await guardTarget(admin, context.userId, data.userId);

    const { data: u } = await admin.auth.admin.getUserById(data.userId);
    const email = String(u?.user?.email ?? "").toLowerCase();
    if (!email || email !== String(data.confirmEmail ?? "").trim().toLowerCase()) {
      throw new Error("O e-mail digitado não confere com o da conta.");
    }
    const { data: sub } = await admin.from("subscriptions").select("status").eq("user_id", data.userId).maybeSingle();
    if (sub && sub.status !== "cancelado") throw new Error("Inative a conta antes de excluir.");

    // empresa com outras pessoas ativas não é apagada junto (evita perder dados de uma equipe)
    const orgs = await ownedOrgs(admin, data.userId);
    for (const o of orgs) {
      const { count } = await admin
        .from("organization_members")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", o.id)
        .eq("status", "active")
        .neq("user_id", data.userId);
      if ((count ?? 0) > 0) {
        throw new Error(
          `A empresa "${o.name}" tem outras pessoas ativas. Passe a empresa para outra pessoa ou tire a equipe antes de excluir esta conta.`,
        );
      }
    }

    const notDeleted: string[] = [];
    for (const o of orgs) {
      const { error } = await admin.from("organizations").delete().eq("id", o.id);
      if (error) notDeleted.push(o.name);
    }
    await admin.from("subscriptions").delete().eq("user_id", data.userId);
    const { error: delErr } = await admin.auth.admin.deleteUser(data.userId);
    if (delErr) throw new Error(`Não foi possível excluir a conta: ${delErr.message}`);
    return { ok: true, companiesKept: notDeleted };
  });
