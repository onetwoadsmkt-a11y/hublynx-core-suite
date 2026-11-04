import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TaskAssignee = { user_id: string; name: string };

/**
 * Quem pode ser responsável por uma tarefa:
 * - tarefa de projeto → equipe do projeto que executa (gestor, editor, executor);
 * - demais → pessoas da equipe da empresa (sem convidados/clientes).
 * Só nomes (sem e-mails). Ao gravar o responsável, o gatilho do banco avisa a pessoa
 * no sino e por e-mail ("Nova tarefa para você").
 */
export const listTaskAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: z.string().uuid(), projectId: z.string().uuid().nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<TaskAssignee[]> => {
    const db = context.supabase as any;
    const { data: member } = await db.rpc("is_org_member", { _org: data.organizationId });
    if (member !== true) throw new Error("Sem acesso a esta empresa.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    let ids: string[] = [];
    if (data.projectId) {
      const { data: canView } = await db.rpc("can_view_project", { _project: data.projectId });
      if (canView !== true) throw new Error("Sem acesso a este projeto.");
      const { data: rows, error } = await admin
        .from("project_members")
        .select("user_id")
        .eq("project_id", data.projectId)
        .eq("status", "active")
        .in("access_role", ["gestor", "editor", "executor"]);
      if (error) throw new Error(error.message);
      ids = ((rows ?? []) as any[]).map((r) => r.user_id).filter(Boolean);
    } else {
      const { data: rows, error } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", data.organizationId)
        .eq("status", "active")
        .neq("role", "guest");
      if (error) throw new Error(error.message);
      ids = ((rows ?? []) as any[]).map((r) => r.user_id).filter(Boolean);
    }
    ids = [...new Set(ids)];
    if (!ids.length) return [];
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", ids);
    const names = new Map(((profiles ?? []) as any[]).map((p) => [p.id as string, (p.full_name as string | null) ?? ""]));
    return ids
      .map((id) => ({ user_id: id, name: names.get(id) || "Pessoa da equipe" }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  });
