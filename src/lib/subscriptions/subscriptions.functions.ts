import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALL_CAPABILITIES, type Capability } from "./capabilities";

export type MyAccess = {
  isAdmin: boolean;
  status: string;
  capabilities: Capability[];
  plan: string | null;
  accountName: string | null;
};

async function isAdminUser(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAccess> => {
    const { supabase, userId } = context;
    const admin = await isAdminUser(supabase, userId);
    const { data } = await supabase
      .from("subscriptions")
      .select("plan, status, capabilities, account_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (admin || !data) {
      return {
        isAdmin: admin,
        status: data?.status ?? "ativo",
        capabilities: ALL_CAPABILITIES,
        plan: data?.plan ?? null,
        accountName: data?.account_name ?? null,
      };
    }
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
  .inputValidator(
    (d: {
      email: string;
      password: string;
      accountName: string;
      plan: string;
      priceMonthly: number;
      capabilities: string[];
    }) => d,
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.accountName },
    });
    if (error) throw new Error(error.message);
    const userId = created.user!.id;
    const { error: subError } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: userId,
        account_name: data.accountName,
        plan: data.plan,
        status: "ativo",
        price_monthly: data.priceMonthly,
        capabilities: data.capabilities,
      },
      { onConflict: "user_id" },
    );
    if (subError) throw new Error(subError.message);
    return { ok: true, userId };
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
