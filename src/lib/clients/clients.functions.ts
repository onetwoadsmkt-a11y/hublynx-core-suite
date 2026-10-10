import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ClientStatus = "ativo" | "prospecto" | "inadimplente" | "inativo";

export interface ClientRow {
  id: string;
  owner_id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  website: string | null;
  address: string | null;
  status: ClientStatus;
  service: string | null;
  monthly_value: number | null;
  contract_start: string | null;
  contract_renewal: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { clients: (data ?? []) as ClientRow[] };
  });

const clientInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome obrigatório").max(200),
  company: z.string().trim().max(200).nullable().optional(),
  email: z
    .string()
    .trim()
    .max(255)
    .email("E-mail inválido")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  phone: z.string().trim().max(40).nullable().optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  instagram: z.string().trim().max(120).nullable().optional(),
  website: z.string().trim().max(255).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["ativo", "prospecto", "inadimplente", "inativo"]),
  service: z.string().trim().max(120).nullable().optional(),
  monthly_value: z.number().nonnegative().nullable().optional(),
  contract_start: z.string().nullable().optional(),
  contract_renewal: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const upsertClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientInput.parse(d))
  .handler(async ({ data, context }) => {
    const { resolveOrganizationId } = await import("@/lib/org/resolve");
    const payload: any = {
      ...data,
      owner_id: context.userId,
    };
    if (!data.id) {
      const orgId = await resolveOrganizationId(context.supabase as never, context.userId);
      if (orgId) payload.organization_id = orgId;
    }
    const query = data.id
      ? context.supabase.from("clients").update(payload).eq("id", data.id).select().single()
      : context.supabase.from("clients").insert(payload).select().single();
    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    // Fire-and-forget Google Sheets sync
    try {
      const { performSheetsSync } = await import("@/lib/google/sheets-sync.functions");
      await performSheetsSync(context.supabase, context.userId, "client", (row as ClientRow).id);
    } catch (e) {
      console.warn("[sheets-sync] client sync failed:", e);
    }
    return { client: row as ClientRow };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("clients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getClientRelated = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [projects, tasks] = await Promise.all([
      context.supabase
        .from("projects")
        .select("id, name, status, created_at")
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("tasks")
        .select("id, title, status, due_date, created_at")
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    return {
      projects: projects.data ?? [],
      tasks: tasks.data ?? [],
    };
  });
