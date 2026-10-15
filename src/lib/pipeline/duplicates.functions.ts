import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Contatos duplicados no pipeline: unir dois cards do mesmo contato ou marcar
 * que não são a mesma pessoa. Quem pode ver e editar os dois leads pode unir.
 */
type Db = { from: (t: string) => any };
const uuid = z.string().uuid();

const DUP_KEYS = [
  "duplicate_of",
  "duplicate_of_name",
  "duplicate_by",
  "duplicate_detected_at",
  "duplicate_dismissed",
];
const FILL_FIELDS = [
  "email",
  "phone",
  "company",
  "city",
  "state",
  "value",
  "source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "landing_url",
  "referrer",
];
const LINKED_TABLES = ["lead_events", "lead_notes", "lead_files", "lead_tasks", "form_submissions"];

const empty = (v: unknown) => v === null || v === undefined || v === "";
const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
const withoutDup = (m: Record<string, unknown>) => {
  for (const k of DUP_KEYS) delete m[k];
  return m;
};

async function loadLead(db: Db, id: string) {
  const { data, error } = await db.from("leads").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lead não encontrado ou sem acesso.");
  return data as Record<string, any>;
}

/** Dados do lead apontado como original (para o comparativo na tela). */
export const getDuplicateCompare = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const lead = await loadLead(db, data.leadId);
    const dupOf = asObj(lead.metadata).duplicate_of;
    if (typeof dupOf !== "string") return { lead, original: null, stageName: null };
    const { data: original } = await db.from("leads").select("*").eq("id", dupOf).maybeSingle();
    let stageName: string | null = null;
    if (original?.stage_id) {
      const { data: st } = await db
        .from("pipeline_stages")
        .select("name")
        .eq("id", original.stage_id)
        .maybeSingle();
      stageName = (st?.name as string | undefined) ?? null;
    }
    return { lead, original: (original as Record<string, any> | null) ?? null, stageName };
  });

/**
 * Une dois cards do mesmo contato: o card escolhido fica (etapa, responsável e
 * histórico dele), recebe os dados que faltavam, a qualificação mais recente e
 * todo o histórico do outro (notas, tarefas, arquivos, eventos, respostas). O outro
 * card é removido.
 */
export const mergeLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ keepId: uuid, dropId: uuid })
      .refine((v) => v.keepId !== v.dropId)
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const keep = await loadLead(db, data.keepId);
    const drop = await loadLead(db, data.dropId);
    if (
      keep.organization_id &&
      drop.organization_id &&
      keep.organization_id !== drop.organization_id
    ) {
      throw new Error("Os dois leads precisam ser da mesma empresa.");
    }

    const patch: Record<string, unknown> = {};
    for (const f of FILL_FIELDS) if (empty(keep[f]) && !empty(drop[f])) patch[f] = drop[f];
    const dropNewer = new Date(drop.created_at).getTime() > new Date(keep.created_at).getTime();
    const newest = dropNewer ? drop : keep;
    if (!empty(newest.lead_classification)) patch.lead_classification = newest.lead_classification;
    if (!empty(newest.lead_score)) patch.lead_score = newest.lead_score;
    const tagsA = Array.isArray(keep.tags) ? (keep.tags as string[]) : [];
    const tagsB = Array.isArray(drop.tags) ? (drop.tags as string[]) : [];
    if (tagsB.some((t) => !tagsA.includes(t))) patch.tags = [...new Set([...tagsA, ...tagsB])];

    const meta = withoutDup(asObj(keep.metadata));
    const history = Array.isArray(meta.merged_leads) ? (meta.merged_leads as unknown[]) : [];
    meta.merged_leads = [
      ...history,
      {
        id: drop.id,
        name: drop.name,
        email: drop.email,
        phone: drop.phone,
        source: drop.source,
        created_at: drop.created_at,
        merged_at: new Date().toISOString(),
        merged_by: context.userId,
        metadata: withoutDup(asObj(drop.metadata)),
      },
    ];
    // respostas do formulário mais recentes aparecem no card que fica
    if (dropNewer && asObj(drop.metadata).respostas)
      meta.respostas = asObj(drop.metadata).respostas;
    patch.metadata = meta;

    // grava com as permissões de quem está unindo (confere que pode editar)
    // (update bloqueado pelas regras do banco não dá erro: volta sem linhas)
    const { data: canDrop } = await db
      .from("leads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", drop.id)
      .select("id");
    if (!canDrop?.length) throw new Error("Sem permissão para alterar o card duplicado.");
    const { data: kept, error: upErr } = await db
      .from("leads")
      .update(patch)
      .eq("id", keep.id)
      .select("id");
    if (upErr) throw new Error(upErr.message);
    if (!kept?.length) throw new Error("Sem permissão para alterar o card que fica.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Db;
    for (const t of LINKED_TABLES) {
      try {
        await admin.from(t).update({ lead_id: keep.id }).eq("lead_id", drop.id);
      } catch {
        /* tabela opcional */
      }
    }
    await admin.from("lead_events").insert({
      lead_id: keep.id,
      owner_id: keep.owner_id,
      actor_id: context.userId,
      kind: "leads_merged",
      title: "Contato duplicado unido",
      description: `${drop.name ?? "Lead"} (${drop.source ?? "sem origem"}, ${new Date(drop.created_at).toLocaleDateString("pt-BR")}) foi unido a este card.`,
    });
    const { error: delErr } = await admin.from("leads").delete().eq("id", drop.id);
    if (delErr) throw new Error(delErr.message);

    // outros cards que apontavam para o removido passam a apontar para o que ficou
    const { data: pointing } = await admin
      .from("leads")
      .select("id, metadata")
      .eq("organization_id", keep.organization_id)
      .contains("metadata", { duplicate_of: drop.id });
    for (const p of (pointing ?? []) as { id: string; metadata: unknown }[]) {
      await admin
        .from("leads")
        .update({
          metadata: { ...asObj(p.metadata), duplicate_of: keep.id, duplicate_of_name: keep.name },
        })
        .eq("id", p.id);
    }
    return { ok: true as const, keepId: keep.id };
  });

/** "Não é a mesma pessoa": tira o alerta de duplicata do card. */
export const dismissDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const lead = await loadLead(db, data.leadId);
    const meta = { ...asObj(lead.metadata), duplicate_dismissed: true };
    const { data: done, error } = await db
      .from("leads")
      .update({ metadata: meta })
      .eq("id", lead.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!done?.length) throw new Error("Sem permissão para alterar este lead.");
    return { ok: true as const };
  });
