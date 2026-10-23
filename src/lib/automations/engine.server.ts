// Server-only: executa as automações do Kanban.
// Roda com o cliente administrativo, sempre conferindo que automação e lead são da
// mesma empresa. Tudo o que acontece vai para a jornada do lead e para automation_runs.
import {
  conditionsMatch, describeTrigger, renderTemplate, runKey, taskDueISO, triggerFires,
  type Automation, type AutomationAction, type LeadFacts, type TriggerEvent,
} from "./rules";

type Db = any;
const MAX_DEPTH = 3;

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

const ACTION_LABEL: Record<AutomationAction["type"], string> = {
  move_stage: "Mover para etapa",
  add_tag: "Adicionar tag",
  remove_tag: "Remover tag",
  set_temperature: "Mudar temperatura",
  send_email: "Enviar e-mail",
  create_task: "Criar tarefa",
  add_note: "Adicionar anotação",
};

async function leadFacts(db: Db, lead: any): Promise<LeadFacts> {
  const { data: tasks } = await db.from("lead_tasks").select("done, due_at").eq("lead_id", lead.id).eq("done", false);
  const now = Date.now();
  const open = (tasks ?? []) as { due_at: string | null }[];
  return {
    ...lead,
    tags: (lead.tags ?? []) as string[],
    openTasks: open.length,
    overdueTasks: open.filter((t) => t.due_at && new Date(t.due_at).getTime() < now).length,
  };
}

async function loadAutomations(db: Db, stageId: string): Promise<Automation[]> {
  const { data, error } = await db
    .from("pipeline_automations")
    .select("*")
    .eq("stage_id", stageId)
    .eq("active", true)
    .order("position");
  if (error) return []; // migração 22 ainda não aplicada
  return (data ?? []) as Automation[];
}

async function journey(db: Db, lead: any, title: string, description: string | null, meta: Record<string, unknown>) {
  await db.from("lead_events").insert({
    lead_id: lead.id,
    owner_id: lead.owner_id,
    actor_id: null,
    kind: "automation",
    title,
    description,
    meta,
    ...(lead.organization_id ? { organization_id: lead.organization_id } : {}),
  }).then(() => null, () => null);
}

/** Executa uma automação num lead (com trava contra repetição). */
async function execute(db: Db, a: Automation, leadRow: any, ev: TriggerEvent, depth: number): Promise<boolean> {
  if (a.organization_id && leadRow.organization_id && a.organization_id !== leadRow.organization_id) return false;
  const facts = await leadFacts(db, leadRow);
  if (!triggerFires(a.trigger, ev, facts) || !conditionsMatch(a.conditions ?? [], facts)) return false;

  // Trava: só uma execução por passagem na etapa (a chave única do banco garante).
  const key = runKey(a.trigger, facts, ev);
  const { data: claim, error: claimErr } = await db
    .from("automation_runs")
    .insert({ automation_id: a.id, lead_id: leadRow.id, organization_id: leadRow.organization_id ?? a.organization_id, run_key: key })
    .select("id")
    .maybeSingle();
  if (claimErr || !claim) return false;

  const log: string[] = [];
  const followUps: TriggerEvent[] = [];
  let lead = { ...leadRow };
  let movedTo: string | null = null;
  let failed = false;

  for (const act of a.actions ?? []) {
    try {
      switch (act.type) {
        case "move_stage": {
          if (!act.stage_id || act.stage_id === lead.stage_id) break;
          const { data: st } = await db.from("pipeline_stages").select("id, name, is_won, is_lost").eq("id", act.stage_id).maybeSingle();
          if (!st) throw new Error("etapa de destino não existe mais");
          const status = st.is_won ? "ganho" : st.is_lost ? "perdido" : "aberto";
          const { data: upd, error } = await db.from("leads").update({ stage_id: st.id, status, position: 0 }).eq("id", lead.id).select("*").single();
          if (error) throw new Error(error.message);
          lead = upd;
          movedTo = st.id;
          log.push(`movido para "${st.name}"`);
          break;
        }
        case "add_tag":
        case "remove_tag": {
          const cur = ((lead.tags ?? []) as string[]).map(String);
          const has = cur.some((t) => t.toLowerCase() === act.tag.toLowerCase());
          if (act.type === "add_tag" && has) break;
          if (act.type === "remove_tag" && !has) break;
          const next = act.type === "add_tag" ? [...cur, act.tag] : cur.filter((t) => t.toLowerCase() !== act.tag.toLowerCase());
          const { data: upd, error } = await db.from("leads").update({ tags: next }).eq("id", lead.id).select("*").single();
          if (error) throw new Error(error.message);
          lead = upd;
          log.push(`${act.type === "add_tag" ? "tag adicionada" : "tag removida"}: ${act.tag}`);
          if (act.type === "add_tag") followUps.push({ kind: "tag_added", tag: act.tag });
          break;
        }
        case "set_temperature": {
          const { data: upd, error } = await db.from("leads").update({ temperature: act.value }).eq("id", lead.id).select("*").single();
          if (error) throw new Error(error.message);
          lead = upd;
          log.push(`temperatura: ${act.value}`);
          break;
        }
        case "send_email": {
          if (!lead.email) throw new Error("lead sem e-mail");
          const { data: tpl } = await db.from("email_templates").select("subject, body, organization_id").eq("id", act.template_id).maybeSingle();
          if (!tpl) throw new Error("modelo de e-mail não encontrado");
          const { data: st } = lead.stage_id
            ? await db.from("pipeline_stages").select("name, pipelines(name)").eq("id", lead.stage_id).maybeSingle()
            : { data: null };
          const { data: owner } = await db.from("profiles").select("full_name").eq("id", a.owner_id).maybeSingle();
          const extra = { etapa: st?.name ?? "", pipeline: st?.pipelines?.name ?? "", responsavel: owner?.full_name ?? "" };
          const f = await leadFacts(db, lead);
          const subject = renderTemplate(tpl.subject, f, extra);
          const body = renderTemplate(tpl.body, f, extra);
          const { sendGmail } = await import("@/lib/google/gmail-send.server");
          await sendGmail(a.owner_id, [lead.email], subject, body);
          await db.from("lead_events").insert({
            lead_id: lead.id, owner_id: lead.owner_id, actor_id: null, kind: "email_sent",
            title: `E-mail enviado: ${subject}`, description: body.slice(0, 300),
            meta: { to: [lead.email], automation_id: a.id },
            ...(lead.organization_id ? { organization_id: lead.organization_id } : {}),
          }).then(() => null, () => null);
          log.push(`e-mail enviado: ${subject}`);
          break;
        }
        case "create_task": {
          const due = taskDueISO(act.days ?? 0, act.time ?? "10:00");
          const base: Record<string, unknown> = {
            lead_id: lead.id,
            owner_id: a.owner_id,
            title: act.title || "Follow-up",
            kind: act.kind ?? "follow_up",
            due_at: due,
            duration_minutes: act.duration || 30,
            ...(lead.organization_id ? { organization_id: lead.organization_id } : {}),
          };
          let ins = await db.from("lead_tasks").insert({ ...base, priority: act.priority ?? "media" }).select("id").single();
          if (ins.error && /priority/i.test(ins.error.message)) ins = await db.from("lead_tasks").insert(base).select("id").single();
          if (ins.error) throw new Error(ins.error.message);
          // Google Agenda de quem criou a automação (melhor esforço).
          try {
            const { upsertLeadCalendarEvent } = await import("@/lib/google/lead-calendar.server");
            const r = await upsertLeadCalendarEvent(a.owner_id, {
              title: `[${lead.name}] ${base.title}`, kind: String(base.kind), description: `Criada pela automação "${a.name}"`,
              startISO: due, durationMinutes: Number(base.duration_minutes), attendees: [], withMeet: base.kind === "reuniao", eventId: null,
            });
            if (r.eventId) await db.from("lead_tasks").update({ gcal_event_id: r.eventId, meet_link: r.meetLink }).eq("id", ins.data.id);
          } catch { /* sem Google conectado */ }
          log.push(`tarefa criada: ${base.title}`);
          break;
        }
        case "add_note": {
          const f = await leadFacts(db, lead);
          const text = renderTemplate(act.text ?? "", f);
          if (!text.trim()) break;
          const { error } = await db.from("lead_notes").insert({
            lead_id: lead.id, owner_id: lead.owner_id, author_id: null, body: `[Automação: ${a.name}] ${text}`,
            ...(lead.organization_id ? { organization_id: lead.organization_id } : {}),
          });
          if (error) throw new Error(error.message);
          log.push("anotação adicionada");
          break;
        }
      }
    } catch (e: any) {
      failed = true;
      log.push(`${ACTION_LABEL[act.type] ?? act.type}: falhou (${e?.message ?? "erro"})`);
    }
  }

  await db.from("automation_runs").update({ status: failed ? "error" : "ok", detail: log.join(" · ").slice(0, 2000) }).eq("id", claim.id);
  await journey(db, lead, `Automação: ${a.name}`, `${describeTrigger(a.trigger)} → ${log.join(" · ") || "sem ações"}`, { automation_id: a.id, run_key: key, failed });

  // Encadeamentos (com limite): entrou em outra etapa / recebeu tag.
  if (depth < MAX_DEPTH) {
    if (movedTo) await fireLeadAutomations({ leadId: lead.id, event: { kind: "enter" }, depth: depth + 1 });
    else for (const f of followUps) await fireLeadAutomations({ leadId: lead.id, event: f, depth: depth + 1 });
  }
  return true;
}

/**
 * Dispara as automações da etapa atual do lead para um evento (entrou na etapa,
 * recebeu tag). Nunca lança: falhas ficam no log da automação.
 */
export async function fireLeadAutomations(opts: { leadId: string; event: TriggerEvent; depth?: number }): Promise<number> {
  try {
    const db = await admin();
    const { data: lead } = await db.from("leads").select("*").eq("id", opts.leadId).maybeSingle();
    if (!lead?.stage_id) return 0;
    const list = await loadAutomations(db, lead.stage_id);
    let ran = 0;
    for (const a of list) {
      if (a.trigger?.type === "after_time") continue;
      if (await execute(db, a, lead, opts.event, opts.depth ?? 0)) ran++;
    }
    return ran;
  } catch (e) {
    console.error("[automations] falha ao disparar:", (e as Error).message);
    return 0;
  }
}

/** Automações por tempo ("X dias após entrar na etapa") que já venceram. */
export async function runDueAutomations(opts: { organizationId?: string | null; limit?: number } = {}) {
  const db = await admin();
  let q = db.from("pipeline_automations").select("*").eq("active", true);
  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  const { data, error } = await q;
  if (error) return { checked: 0, ran: 0 };
  const now = new Date();
  let checked = 0, ran = 0;
  for (const a of ((data ?? []) as Automation[]).filter((x) => x.trigger?.type === "after_time")) {
    const minutes = (a.trigger as { minutes: number }).minutes;
    const limitDate = new Date(now.getTime() - minutes * 60_000).toISOString();
    const { data: leads } = await db
      .from("leads")
      .select("*")
      .eq("stage_id", a.stage_id)
      .lte("stage_entered_at", limitDate)
      .limit(opts.limit ?? 200);
    if (!leads?.length) continue;
    const { data: done } = await db
      .from("automation_runs")
      .select("lead_id, run_key")
      .eq("automation_id", a.id)
      .in("lead_id", leads.map((l: any) => l.id));
    const seen = new Set((done ?? []).map((r: any) => `${r.lead_id}|${r.run_key}`));
    for (const lead of leads) {
      checked++;
      if (seen.has(`${lead.id}|${lead.stage_entered_at}`)) continue;
      if (await execute(db, a, lead, { kind: "tick", now }, 0)) ran++;
    }
  }
  return { checked, ran };
}
