import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveOrganizationId } from "@/lib/org/resolve";

const moduleSchema = z.object({ slug: z.enum(["tarefas", "projetos", "clientes", "agenda", "hub"]), organizationId: z.string().uuid().optional() });
const orgCodes: Record<string, string> = { tarefas: "tasks", projetos: "projects", clientes: "crm", agenda: "tasks" };

async function assertModuleAccess(db: any, userId: string, slug: string, provided?: string) {
  const organizationId = await resolveOrganizationId(db, userId, provided);
  if (!organizationId) throw new Error("Aguardando liberação de acesso à empresa.");
  const { data: org, error } = await db.from("organizations").select("status").eq("id", organizationId).single();
  if (error || !org || !["active", "trial"].includes(org.status)) throw new Error("Empresa indisponível.");
  const code = orgCodes[slug];
  if (code) {
    const { data: allowed, error: accessError } = await db.rpc("has_module", { _org: organizationId, _code: code });
    if (accessError || !allowed) throw new Error("Módulo não liberado para esta conta.");
  }
  return organizationId;
}

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
      .select("module_slug, enabled, installed_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []) as UserModuleRow[];
  });

export const setModuleEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => moduleSchema.extend({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const organizationId = await assertModuleAccess(context.supabase, context.userId, data.slug, data.organizationId);
    const { error } = await context.supabase
      .from("user_modules")
      .upsert(
        { user_id: context.userId, organization_id: organizationId, module_slug: data.slug, enabled: data.enabled },
        { onConflict: "user_id,module_slug" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markModuleInstalled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => moduleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const organizationId = await assertModuleAccess(context.supabase, context.userId, data.slug, data.organizationId);
    const { error } = await context.supabase
      .from("user_modules")
      .upsert(
        {
          user_id: context.userId,
          organization_id: organizationId,
          module_slug: data.slug,
          enabled: true,
          installed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,module_slug" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
