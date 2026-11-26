import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cancelOpenProjectTasks } from "@/lib/projects/cancel-tasks";

/**
 * Desfazer "venda ganha" (lead marcado como ganho por engano).
 * O lead volta para uma etapa em aberto, deixa de ser cliente convertido e perde a tag de
 * ganho. Opcionalmente (só administrador da empresa) exclui o projeto e o cliente criados
 * na conversão. Não roda as automações da etapa de volta (não reenvia e-mails/tarefas).
 */

const uuid = z.string().uuid();

type Db = any;

async function loadLead(db: Db, leadId: string) {
  const { data: lead, error } = await db
    .from("leads")
    .select("id, name, organization_id, stage_id, tags, status, client_id, converted_client_id, converted_project_id, converted_at")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) throw new Error("Lead não encontrado (ou sem permissão).");
  return lead as {
    id: string; name: string; organization_id: string | null; stage_id: string | null; tags: string[] | null;
    status: string | null; client_id: string | null; converted_client_id: string | null;
    converted_project_id: string | null; converted_at: string | null;
  };
}

async function wonTagSlugs(db: Db, organizationId: string | null): Promise<Set<string>> {
  const set = new Set<string>(["ganho"]);
  let q = db.from("pipelines").select("id");
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data: pipes } = await q;
  const ids = ((pipes ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (!ids.length) return set;
  const { readTagsForPipelines } = await import("./tags.server");
  const byPipeline = await readTagsForPipelines(ids);
  for (const list of Object.values(byPipeline)) {
    for (const t of list as Array<{ slug: string; funnel_key?: string | null }>) {
      if (t.funnel_key === "ganho") set.add(String(t.slug).toLowerCase());
    }
  }
  return set;
}

/** Projeto/cliente da conversão e etapa sugerida (a de antes da venda ganha). */
async function info(db: Db, leadId: string) {
  const lead = await loadLead(db, leadId);
  const { data: curStage } = lead.stage_id
    ? await db.from("pipeline_stages").select("id, name, pipeline_id, is_won, is_lost").eq("id", lead.stage_id).maybeSingle()
    : { data: null };

  // Etapa de antes: o último "Etapa alterada" que entrou na etapa atual (ganha).
  let previousStageId: string | null = null;
  if (lead.stage_id) {
    const { data: evs } = await db
      .from("lead_events")
      .select("meta, created_at")
      .eq("lead_id", leadId)
      .eq("kind", "stage_changed")
      .order("created_at", { ascending: false })
      .limit(30);
    for (const e of (evs ?? []) as Array<{ meta: { from?: string; to?: string } | null }>) {
      if (e.meta?.to === lead.stage_id && e.meta?.from) { previousStageId = e.meta.from; break; }
    }
  }
  if (previousStageId) {
    const { data: prev } = await db.from("pipeline_stages").select("id, is_won, is_lost").eq("id", previousStageId).maybeSingle();
    if (!prev || prev.is_won || prev.is_lost) previousStageId = null;
  }

  let project: { id: string; name: string; openTasks: number; doneTasks: number } | null = null;
  if (lead.converted_project_id) {
    const { data: p } = await db.from("projects").select("id, name").eq("id", lead.converted_project_id).maybeSingle();
    if (p) {
      const { data: ts } = await db.from("tasks").select("status").eq("project_id", p.id);
      const list = (ts ?? []) as Array<{ status: string }>;
      project = {
        id: p.id, name: p.name,
        openTasks: list.filter((t) => t.status !== "concluido" && t.status !== "cancelado").length,
        doneTasks: list.filter((t) => t.status === "concluido").length,
      };
    }
  }

  let client: { id: string; name: string; otherProjects: number; otherLeads: number; canRemove: boolean } | null = null;
  const clientId = lead.converted_client_id ?? null;
  if (clientId) {
    const { data: c } = await db.from("clients").select("id, name, notes").eq("id", clientId).maybeSingle();
    if (c) {
      const { data: projs } = await db.from("projects").select("id").eq("client_id", c.id);
      const otherProjects = ((projs ?? []) as Array<{ id: string }>).filter((x) => x.id !== lead.converted_project_id).length;
      const { data: lds } = await db.from("leads").select("id").or(`client_id.eq.${c.id},converted_client_id.eq.${c.id}`);
      const otherLeads = ((lds ?? []) as Array<{ id: string }>).filter((x) => x.id !== lead.id).length;
      // Só remove o cliente que nasceu desta conversão e não tem mais nada ligado
      const fromThisLead = String(c.notes ?? "").startsWith(`Convertido do lead "${lead.name}"`);
      client = { id: c.id, name: c.name, otherProjects, otherLeads, canRemove: fromThisLead && otherProjects === 0 && otherLeads === 0 };
    }
  }

  let isAdmin = false;
  if (lead.organization_id) {
    const { data } = await db.rpc("is_org_admin", { _org: lead.organization_id });
    isAdmin = data === true;
  }

  const tags = await wonTagSlugs(db, lead.organization_id);
  const hasWonTag = (lead.tags ?? []).some((t) => tags.has(String(t).toLowerCase()));

  return {
    lead,
    currentStage: curStage as { id: string; name: string; pipeline_id: string | null; is_won: boolean; is_lost: boolean } | null,
    isWon: !!(lead.converted_client_id || lead.converted_project_id || curStage?.is_won || hasWonTag || lead.status === "ganho"),
    previousStageId,
    project,
    client,
    isAdmin,
  };
}

export const getReopenInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await info(context.supabase as Db, data.leadId);
    return {
      isWon: r.isWon,
      currentStageName: r.currentStage?.name ?? null,
      pipelineId: r.currentStage?.pipeline_id ?? null,
      previousStageId: r.previousStageId,
      convertedAt: r.lead.converted_at,
      project: r.project,
      client: r.client,
      isAdmin: r.isAdmin,
    };
  });

export const reopenWonLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      leadId: uuid,
      stageId: uuid,
      deleteProject: z.boolean().default(false),
      deleteClient: z.boolean().default(false),
      reason: z.string().trim().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as Db;
    const r = await info(db, data.leadId);
    if (!r.isWon) throw new Error("Este lead não está como venda ganha.");

    // Etapa de destino: em aberto e da mesma empresa
    const { data: target, error: tErr } = await db
      .from("pipeline_stages")
      .select("id, name, is_won, is_lost, organization_id")
      .eq("id", data.stageId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!target) throw new Error("Etapa de destino não encontrada.");
    if (target.is_won || target.is_lost) throw new Error("Escolha uma etapa em aberto (não a de venda ganha nem a de desqualificado).");
    if (r.lead.organization_id && target.organization_id && target.organization_id !== r.lead.organization_id) {
      throw new Error("A etapa escolhida é de outra empresa.");
    }
    if ((data.deleteProject || data.deleteClient) && !r.isAdmin) {
      throw new Error("Só o administrador da empresa pode excluir o projeto ou o cliente da conversão.");
    }
    if (data.deleteClient && !r.client?.canRemove) {
      throw new Error("O cliente tem outros projetos ou leads ligados e não pode ser removido.");
    }
    if (data.deleteClient && r.project && !data.deleteProject) {
      throw new Error("Para remover o cliente, exclua também o projeto criado na conversão.");
    }

    // 1) Lead volta a ficar em aberto (o banco registra "Etapa alterada" e "Status" na jornada)
    const wonTags = await wonTagSlugs(db, r.lead.organization_id);
    const tags = (r.lead.tags ?? []).filter((t) => !wonTags.has(String(t).toLowerCase()));
    const { count } = await db.from("leads").select("id", { count: "exact", head: true }).eq("stage_id", target.id);
    const { data: upd, error: uErr } = await db
      .from("leads")
      .update({
        stage_id: target.id,
        position: count ?? 0,
        status: "aberto",
        tags,
        converted_client_id: null,
        converted_project_id: null,
        converted_at: null,
        ...(data.deleteClient ? { client_id: null } : {}),
      })
      .eq("id", r.lead.id)
      .select("id");
    if (uErr) throw new Error(uErr.message);
    if (!upd?.length) throw new Error("Sem permissão para alterar este lead.");

    // 2) Projeto e cliente da conversão (opcional)
    const removed: string[] = [];
    if (data.deleteProject && r.project) {
      await cancelOpenProjectTasks(db, r.project.id);
      const { error } = await db.from("projects").delete().eq("id", r.project.id);
      if (error) throw new Error(`O lead foi reaberto, mas o projeto não pôde ser excluído: ${error.message}`);
      removed.push(`projeto "${r.project.name}"`);
    }
    if (data.deleteClient && r.client) {
      const { error } = await db.from("clients").delete().eq("id", r.client.id);
      if (error) throw new Error(`O lead foi reaberto, mas o cliente não pôde ser removido: ${error.message}`);
      removed.push(`cliente "${r.client.name}"`);
    }

    // 3) Jornada
    const kept = [
      r.project && !data.deleteProject ? `projeto "${r.project.name}" mantido` : null,
      r.client && !data.deleteClient ? `cliente "${r.client.name}" mantido` : null,
    ].filter(Boolean);
    await db.from("lead_events").insert({
      lead_id: r.lead.id,
      owner_id: context.userId,
      actor_id: context.userId,
      kind: "reopened",
      title: "Venda ganha desfeita",
      description: [
        `Voltou para a etapa "${target.name}".`,
        removed.length ? `Excluído: ${removed.join(" e ")}.` : null,
        kept.length ? `${kept.join("; ")}.` : null,
        data.reason ? `Motivo: ${data.reason}` : null,
      ].filter(Boolean).join(" "),
      meta: {
        from_stage: r.currentStage?.id ?? null,
        to_stage: target.id,
        project_id: r.project?.id ?? null,
        client_id: r.client?.id ?? null,
        deleted_project: data.deleteProject && !!r.project,
        deleted_client: data.deleteClient && !!r.client,
      },
    });

    return { ok: true as const, stageName: target.name as string, removed };
  });
