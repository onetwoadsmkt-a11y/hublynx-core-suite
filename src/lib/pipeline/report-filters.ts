import { isWonLead } from "./lead-status";

export type Temperature = "quente" | "morno" | "frio";
export type Situation = "leads" | "ganhos" | "todos";

export type ReportFilters = {
  pipelineId: string | null;
  stageIds: string[];
  temperatures: Temperature[];
  tags: string[];
  /** "any": tem pelo menos uma das tags; "all": tem todas. */
  tagMode: "any" | "all";
  /** Leads com tarefa atrasada. */
  overdueTasks: boolean;
  /** Leads sem nenhuma tarefa em aberto. */
  noTasks: boolean;
  situation: Situation;
};

export const EMPTY_FILTERS: ReportFilters = {
  pipelineId: null, stageIds: [], temperatures: [], tags: [], tagMode: "any",
  overdueTasks: false, noTasks: false, situation: "todos",
};

export type TaskStat = { open: number; overdue: number; next: string | null };
export type LeadTaskRow = { lead_id: string; done: boolean; due_at: string | null };

/** Resumo de agendamentos por lead: em aberto, atrasados e o próximo horário. */
export function taskStatsByLead(rows: LeadTaskRow[], now = new Date()): Map<string, TaskStat> {
  const map = new Map<string, TaskStat>();
  const nowMs = now.getTime();
  for (const r of rows) {
    if (r.done) continue;
    const s = map.get(r.lead_id) ?? { open: 0, overdue: 0, next: null };
    s.open++;
    if (r.due_at) {
      const t = new Date(r.due_at).getTime();
      if (t < nowMs) s.overdue++;
      else if (!s.next || t < new Date(s.next).getTime()) s.next = r.due_at;
    }
    map.set(r.lead_id, s);
  }
  return map;
}

type LeadLike = {
  id: string;
  stage_id?: string | null;
  temperature?: string | null;
  tags?: string[] | null;
  converted_client_id?: string | null;
};

/**
 * Aplica os filtros do relatório comercial. Os filtros de tarefas somam:
 * marcar "atrasadas" e "sem tarefas" traz os dois grupos.
 */
export function applyReportFilters<L extends LeadLike>(
  leads: L[],
  f: ReportFilters,
  ctx: {
    stagePipeline: Map<string, string | null>;
    stats: Map<string, TaskStat>;
    wonStageIds: Set<string>;
    wonTagSlugs: Set<string>;
  },
): L[] {
  const wantTags = f.tags.map((t) => t.toLowerCase());
  return leads.filter((l) => {
    if (f.pipelineId && (!l.stage_id || ctx.stagePipeline.get(l.stage_id) !== f.pipelineId)) return false;
    if (f.stageIds.length && (!l.stage_id || !f.stageIds.includes(l.stage_id))) return false;
    if (f.temperatures.length && !f.temperatures.includes((l.temperature ?? "") as Temperature)) return false;
    if (wantTags.length) {
      const has = new Set((l.tags ?? []).map((t) => String(t).toLowerCase()));
      const ok = f.tagMode === "all" ? wantTags.every((t) => has.has(t)) : wantTags.some((t) => has.has(t));
      if (!ok) return false;
    }
    if (f.overdueTasks || f.noTasks) {
      const s = ctx.stats.get(l.id);
      const isOverdue = !!s && s.overdue > 0;
      const isEmpty = !s || s.open === 0;
      if (!((f.overdueTasks && isOverdue) || (f.noTasks && isEmpty))) return false;
    }
    if (f.situation !== "todos") {
      const won = isWonLead(l, ctx.wonStageIds, ctx.wonTagSlugs);
      if (f.situation === "ganhos" ? !won : won) return false;
    }
    return true;
  });
}
