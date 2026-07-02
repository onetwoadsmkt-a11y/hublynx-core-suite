import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UserModuleRow = {
  module_slug: string;
  enabled: boolean;
  installed_at: string | null;
};

export const listUserModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_modules")
      .select("module_slug, enabled, installed_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as UserModuleRow[];
  });

export const setModuleEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string; enabled: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_modules")
      .upsert(
        { user_id: context.userId, module_slug: data.slug, enabled: data.enabled },
        { onConflict: "user_id,module_slug" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markModuleInstalled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_modules")
      .upsert(
        {
          user_id: context.userId,
          module_slug: data.slug,
          enabled: true,
          installed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,module_slug" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
