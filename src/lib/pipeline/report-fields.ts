import type { Lead } from "@/components/pipeline/types";

export type LeadFieldKey =
  | "name"
  | "company"
  | "email"
  | "phone"
  | "city"
  | "state"
  | "status"
  | "temperature"
  | "value"
  | "stage"
  | "pipeline"
  | "source"
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "utm_term"
  | "utm_content"
  | "gclid"
  | "fbclid"
  | "landing_url"
  | "referrer"
  | "tags"
  | "notes"
  | "open_tasks"
  | "overdue_tasks"
  | "next_task"
  | "last_contact_at"
  | "created_at"
  | "updated_at";

export type FieldDef = {
  key: LeadFieldKey;
  label: string;
  group: "Contato" | "Comercial" | "Trackeamento" | "Datas";
};

export const LEAD_FIELDS: FieldDef[] = [
  { key: "name", label: "Nome", group: "Contato" },
  { key: "company", label: "Empresa", group: "Contato" },
  { key: "email", label: "E-mail", group: "Contato" },
  { key: "phone", label: "Telefone", group: "Contato" },
  { key: "city", label: "Cidade", group: "Contato" },
  { key: "state", label: "Estado", group: "Contato" },
  { key: "pipeline", label: "Pipeline", group: "Comercial" },
  { key: "stage", label: "Etapa", group: "Comercial" },
  { key: "status", label: "Status", group: "Comercial" },
  { key: "temperature", label: "Temperatura", group: "Comercial" },
  { key: "value", label: "Valor", group: "Comercial" },
  { key: "tags", label: "Tags", group: "Comercial" },
  { key: "notes", label: "Notas", group: "Comercial" },
  { key: "open_tasks", label: "Tarefas em aberto", group: "Comercial" },
  { key: "overdue_tasks", label: "Tarefas atrasadas", group: "Comercial" },
  { key: "next_task", label: "Próxima tarefa", group: "Comercial" },
  { key: "source", label: "Origem", group: "Trackeamento" },
  { key: "utm_source", label: "UTM Source", group: "Trackeamento" },
  { key: "utm_medium", label: "UTM Medium", group: "Trackeamento" },
  { key: "utm_campaign", label: "UTM Campaign", group: "Trackeamento" },
  { key: "utm_term", label: "UTM Term", group: "Trackeamento" },
  { key: "utm_content", label: "UTM Content", group: "Trackeamento" },
  { key: "gclid", label: "GCLID", group: "Trackeamento" },
  { key: "fbclid", label: "FBCLID", group: "Trackeamento" },
  { key: "landing_url", label: "Landing URL", group: "Trackeamento" },
  { key: "referrer", label: "Referrer", group: "Trackeamento" },
  { key: "created_at", label: "Criado em", group: "Datas" },
  { key: "updated_at", label: "Atualizado em", group: "Datas" },
  { key: "last_contact_at", label: "Último contato", group: "Datas" },
];

export const DEFAULT_FIELDS: LeadFieldKey[] = LEAD_FIELDS.map((f) => f.key);

export function fmtDateTimeBR(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR");
}

export function leadFieldValue(
  lead: Lead,
  key: LeadFieldKey,
  ctx: { stageName?: string; pipelineName?: string; notesText?: string; tasks?: { open: number; overdue: number; next: string | null } },
): string | number {
  switch (key) {
    case "open_tasks":
      return ctx.tasks?.open ?? 0;
    case "overdue_tasks":
      return ctx.tasks?.overdue ?? 0;
    case "next_task":
      return fmtDateTimeBR(ctx.tasks?.next ?? null);
    case "notes":
      return ctx.notesText ?? "";
    case "stage":
      return ctx.stageName ?? "";
    case "pipeline":
      return ctx.pipelineName ?? "";
    case "value":
      return lead.value != null ? Number(lead.value) : "";
    case "tags":
      return (lead.tags ?? []).join(", ");
    case "created_at":
    case "updated_at":
    case "last_contact_at":
      return fmtDateTimeBR(lead[key]);
    default:
      return (lead[key] as string | null) ?? "";
  }
}
