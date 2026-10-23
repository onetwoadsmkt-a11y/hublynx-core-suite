/**
 * Automações do Kanban (inspiradas no Digital Pipeline do Kommo): para cada etapa,
 * QUANDO dispara, SE as condições batem, ENTÃO executa ações em ordem.
 * Este arquivo é puro (sem banco), para ser testado e usado na tela e no servidor.
 */

export type AutomationTrigger =
  | { type: "on_enter" }
  | { type: "after_time"; minutes: number }
  | { type: "on_enter_with_tag"; tag: string }
  | { type: "on_tag_added"; tag: string };

export type AutomationCondition =
  | { field: "tags_any"; value: string[] }
  | { field: "tags_none"; value: string[] }
  | { field: "temperature"; value: string[] }
  | { field: "value_gte"; value: number }
  | { field: "value_lte"; value: number }
  | { field: "no_open_tasks" }
  | { field: "has_overdue_task" }
  | { field: "has_email" }
  | { field: "has_phone" };

export type AutomationAction =
  | { type: "move_stage"; stage_id: string }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | { type: "set_temperature"; value: "quente" | "morno" | "frio" }
  | { type: "send_email"; template_id: string }
  | { type: "create_task"; kind: "tarefa" | "reuniao" | "call" | "follow_up"; title: string; days: number; time: string; priority: "baixa" | "media" | "alta" | "critica"; duration: number }
  | { type: "add_note"; text: string };

export type Automation = {
  id: string;
  organization_id: string;
  owner_id: string;
  pipeline_id: string;
  stage_id: string;
  name: string;
  active: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  position: number;
};

export type LeadFacts = {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  value?: number | null;
  temperature?: string | null;
  tags?: string[] | null;
  stage_id?: string | null;
  stage_entered_at?: string | null;
  openTasks: number;
  overdueTasks: number;
};

const low = (a: string[] | null | undefined) => (a ?? []).map((t) => String(t).toLowerCase());

/** Todas as condições precisam bater (E). Lista vazia = sempre. */
export function conditionsMatch(conds: AutomationCondition[], lead: LeadFacts): boolean {
  const tags = new Set(low(lead.tags));
  return conds.every((c) => {
    switch (c.field) {
      case "tags_any": return low(c.value).some((t) => tags.has(t));
      case "tags_none": return !low(c.value).some((t) => tags.has(t));
      case "temperature": return c.value.includes(lead.temperature ?? "");
      case "value_gte": return Number(lead.value ?? 0) >= Number(c.value);
      case "value_lte": return Number(lead.value ?? 0) <= Number(c.value);
      case "no_open_tasks": return lead.openTasks === 0;
      case "has_overdue_task": return lead.overdueTasks > 0;
      case "has_email": return !!lead.email?.trim();
      case "has_phone": return !!lead.phone?.trim();
      default: return true;
    }
  });
}

export type TriggerEvent =
  | { kind: "enter" }
  | { kind: "tag_added"; tag: string }
  | { kind: "tick"; now: Date };

/** A automação dispara para este evento e este lead? */
export function triggerFires(t: AutomationTrigger, ev: TriggerEvent, lead: LeadFacts): boolean {
  if (t.type === "on_enter") return ev.kind === "enter";
  if (t.type === "on_enter_with_tag") return ev.kind === "enter" && low(lead.tags).includes(t.tag.toLowerCase());
  if (t.type === "on_tag_added") return ev.kind === "tag_added" && ev.tag.toLowerCase() === t.tag.toLowerCase();
  if (t.type === "after_time") {
    if (ev.kind !== "tick" || !lead.stage_entered_at) return false;
    return ev.now.getTime() - new Date(lead.stage_entered_at).getTime() >= t.minutes * 60_000;
  }
  return false;
}

/**
 * Chave da execução: uma vez por passagem na etapa (on_enter/after_time/com tag)
 * ou uma vez por tag recebida nessa passagem.
 */
export function runKey(t: AutomationTrigger, lead: LeadFacts, ev: TriggerEvent): string {
  const pass = lead.stage_entered_at ?? "sem-data";
  return ev.kind === "tag_added" ? `${pass}#tag:${ev.tag.toLowerCase()}` : pass;
}

/** Variáveis dos modelos de e-mail: {nome}, {primeiro_nome}, {empresa}, {etapa}... */
export function renderTemplate(
  text: string,
  lead: LeadFacts,
  extra: { etapa?: string; pipeline?: string; responsavel?: string } = {},
  opts: { html?: boolean } = {},
) {
  const vars: Record<string, string> = {
    nome: lead.name ?? "",
    primeiro_nome: (lead.name ?? "").trim().split(/\s+/)[0] ?? "",
    empresa: lead.company ?? "",
    email: lead.email ?? "",
    telefone: lead.phone ?? "",
    cidade: lead.city ?? "",
    estado: lead.state ?? "",
    valor: lead.value != null ? Number(lead.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    etapa: extra.etapa ?? "",
    pipeline: extra.pipeline ?? "",
    responsavel: extra.responsavel ?? "",
  };
  // Em HTML, os dados do lead entram escapados (um nome com "<" não quebra o e-mail).
  const val = (v: string) => (opts.html ? escapeHtml(v) : v);
  return text.replace(/\{\s*([a-z_]+)\s*\}/gi, (m, k: string) => (k.toLowerCase() in vars ? val(vars[k.toLowerCase()]) : m));
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** O modelo é HTML? (tem pelo menos uma tag de abertura) */
export function isHtmlBody(body: string): boolean {
  return /<([a-z][a-z0-9]*)\b[^>]*>/i.test(body);
}

/** Remove scripts, iframes e atributos de evento antes de enviar ou pré-visualizar. */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<(script|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|form|base|meta[^>]*http-equiv)[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

/** Versão em texto do HTML (parte "texto simples" do e-mail). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const TEMPLATE_VARS = ["nome", "primeiro_nome", "empresa", "email", "telefone", "cidade", "estado", "valor", "etapa", "pipeline", "responsavel"];

/** Data/hora da tarefa criada pela automação: daqui a N dias, no horário escolhido (fuso de São Paulo). */
export function taskDueISO(days: number, time: string, now = new Date()): string {
  const [h, m] = (time || "10:00").split(":").map((n) => Number(n) || 0);
  // Dia em São Paulo (UTC−3, sem horário de verão desde 2019).
  const sp = new Date(now.getTime() - 3 * 3_600_000);
  const d = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() + Math.max(0, days), h + 3, m));
  return d.toISOString();
}

/** Texto curto do gatilho, para a lista e o histórico. */
export function describeTrigger(t: AutomationTrigger): string {
  switch (t.type) {
    case "on_enter": return "Ao entrar na etapa";
    case "on_enter_with_tag": return `Ao entrar na etapa com a tag "${t.tag}"`;
    case "on_tag_added": return `Ao receber a tag "${t.tag}" nesta etapa`;
    case "after_time": {
      const m = t.minutes;
      if (m % 1440 === 0) return `${m / 1440} dia(s) após entrar na etapa`;
      if (m % 60 === 0) return `${m / 60} hora(s) após entrar na etapa`;
      return `${m} min após entrar na etapa`;
    }
  }
}
