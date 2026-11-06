import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Excluir leads selecionados no Pipeline (Kanban ou Lista).
 * - Só administradores da empresa (exclusão em massa não tem volta).
 * - Leads ligados a projeto ficam (o projeto não pode perder o lead/cliente de origem).
 * - Anotações, tarefas do lead, jornada, arquivos e automações saem junto pelo banco;
 *   depois, por melhor esforço, remove os eventos do Google Agenda (agenda do dono de cada
 *   agendamento) e os arquivos guardados.
 */
const MAX = 500;

export const deleteLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(MAX) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const ids = [...new Set(data.ids)];

    // leads visíveis para quem pede (regras do banco)
    const { data: rows, error } = await db
      .from("leads")
      .select("id, name, organization_id, converted_project_id, converted_client_id, client_id")
      .in("id", ids);
    if (error) throw new Error(error.message);
    const leads = (rows ?? []) as {
      id: string; name: string; organization_id: string | null; converted_project_id: string | null;
      converted_client_id: string | null; client_id: string | null;
    }[];
    if (!leads.length) throw new Error("Nenhum dos leads foi encontrado (ou sem permissão).");

    const orgs = [...new Set(leads.map((l) => l.organization_id).filter(Boolean))] as string[];
    for (const org of orgs) {
      const { data: isAdmin } = await db.rpc("is_org_admin", { _org: org });
      if (isAdmin !== true) throw new Error("Só o administrador da empresa pode excluir leads em massa.");
    }
    if (leads.some((l) => !l.organization_id)) {
      const { data: platform } = await db.rpc("is_super_admin");
      if (platform !== true) throw new Error("Há leads sem empresa: só o administrador da plataforma pode excluí-los.");
    }

    // Ligados a projeto ficam: direto (projeto do lead) ou pelo cliente (lead → cliente → projeto).
    const leadIds = leads.map((l) => l.id);
    const clientIds = [...new Set(leads.flatMap((l) => [l.converted_client_id, l.client_id]).filter(Boolean))] as string[];
    const { data: byLead, error: pErr } = await db.from("projects").select("lead_id").in("lead_id", leadIds);
    if (pErr) throw new Error(pErr.message);
    const { data: byClient, error: cErr } = clientIds.length
      ? await db.from("projects").select("client_id").in("client_id", clientIds)
      : { data: [], error: null };
    if (cErr) throw new Error(cErr.message);
    const { data: clientLeads } = await db.from("clients").select("lead_id, id").in("lead_id", leadIds);
    const { data: byClientLead } = (clientLeads ?? []).length
      ? await db.from("projects").select("client_id").in("client_id", (clientLeads as any[]).map((c) => c.id))
      : { data: [] };
    const projectLead = new Set(((byLead ?? []) as any[]).map((p) => p.lead_id));
    const projectClient = new Set([...(byClient ?? []), ...(byClientLead ?? [])].map((p: any) => p.client_id));
    const clientOfLead = new Map(((clientLeads ?? []) as any[]).map((c) => [c.lead_id, c.id]));
    const kept = leads.filter(
      (l) =>
        l.converted_project_id ||
        projectLead.has(l.id) ||
        (l.converted_client_id && projectClient.has(l.converted_client_id)) ||
        (l.client_id && projectClient.has(l.client_id)) ||
        (clientOfLead.has(l.id) && projectClient.has(clientOfLead.get(l.id))),
    );
    const target = leads.filter((l) => !kept.includes(l)).map((l) => l.id);
    if (!target.length) {
      return { ok: true as const, deleted: 0, kept: kept.map((l) => l.name), notFound: ids.length - leads.length };
    }

    // guarda o que precisa limpar fora do banco antes de apagar
    const [{ data: events }, { data: files }] = await Promise.all([
      db.from("lead_tasks").select("gcal_event_id, owner_id").in("lead_id", target).not("gcal_event_id", "is", null),
      db.from("lead_files").select("storage_path").in("lead_id", target),
    ]);

    const { data: gone, error: delErr } = await db.from("leads").delete().in("id", target).select("id");
    if (delErr) throw new Error(delErr.message);
    const deleted = (gone ?? []).length;

    // limpeza externa (melhor esforço, não desfaz a exclusão se falhar)
    try {
      const { deleteLeadCalendarEvent } = await import("@/lib/google/lead-calendar.server");
      for (const e of ((events ?? []) as any[]).slice(0, 300)) {
        // sem e-mail de cancelamento para os leads apagados
        await deleteLeadCalendarEvent(e.owner_id ?? context.userId, e.gcal_event_id, false).catch(() => null);
      }
    } catch {
      /* sem Google */
    }
    try {
      const paths = ((files ?? []) as any[]).map((f) => f.storage_path as string).filter(Boolean);
      if (paths.length) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const store = (supabaseAdmin as any).storage;
        const newer = paths.filter((p) => p.startsWith("l/"));
        const older = paths.filter((p) => !p.startsWith("l/"));
        if (newer.length) await store.from("task-attachments").remove(newer);
        if (older.length) await store.from("lead-files").remove(older);
      }
    } catch {
      /* arquivos ficam órfãos no armazenamento */
    }

    return { ok: true as const, deleted, kept: kept.map((l) => l.name), notFound: ids.length - leads.length };
  });
