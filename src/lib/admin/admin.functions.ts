import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data: platform, error: platformError } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (platformError) throw new Error("Não foi possível verificar administração.");
  if (platform) return;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;

    const ids = list.users.map((u) => u.id);
    const [{ data: profiles }, { data: roles }, { data: projects }, { data: tasks }, { data: clients }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id,full_name,avatar_url,company").in("id", ids),
        supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", ids),
        supabaseAdmin.from("projects").select("owner_id").in("owner_id", ids),
        supabaseAdmin.from("tasks").select("owner_id").in("owner_id", ids),
        supabaseAdmin.from("clients").select("owner_id").in("owner_id", ids),
      ]);

    const count = (rows: { owner_id: string }[] | null, id: string) =>
      (rows ?? []).filter((r) => r.owner_id === id).length;

    return list.users.map((u) => {
      const profile = profiles?.find((p) => p.id === u.id);
      const role = roles?.find((r) => r.user_id === u.id)?.role ?? "user";
      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        full_name: profile?.full_name ?? null,
        company: profile?.company ?? null,
        role,
        counts: {
          projects: count(projects, u.id),
          tasks: count(tasks, u.id),
          clients: count(clients, u.id),
        },
      };
    });
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "admin" | "user" }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw error;
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Não é possível excluir a própria conta");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });
