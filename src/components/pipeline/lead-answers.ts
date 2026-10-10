import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Dicionário de perguntas/alternativas por empresa (tabela lead_answer_labels). */
export type AnswerLabel = { field_key: string; label: string; options: Record<string, string> | null };

export function useLeadAnswerLabels(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: ["lead-answer-labels", organizationId],
    enabled: !!organizationId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lead_answer_labels")
        .select("field_key, label, options")
        .eq("organization_id", organizationId);
      if (error) return [] as AnswerLabel[];
      return (data ?? []) as AnswerLabel[];
    },
  });
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Chaves que já viram campos do cadastro ou são técnicas — não aparecem como "resposta". */
const SKIP = new Set(
  [
    "name", "nome", "full_name", "nome_completo", "email", "e-mail", "mail", "phone", "telefone", "celular",
    "whatsapp", "whaz", "fone", "tel", "city", "cidade", "state", "estado", "uf", "company", "empresa",
    "source", "origem", "canal", "value", "valor", "lead_score", "score", "lead_classification",
    "classificacao", "classification", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "campanha", "anuncio", "conjunto", "gclid", "fbclid", "landing_url", "referrer", "page", "url",
    "form", "form_id", "form_name", "submission_id", "event", "event_id", "schema_version", "organization_id",
    "created_at", "criado_em", "status", "tags", "utm", "lead", "kanban_target", "merged_at", "lead_pro",
    "tags_formulario", "respostas", "medium", "conteudo", "kommo_id",
  ].map(norm),
);

function display(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(display).filter(Boolean).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** "prazo_abertura" → "Prazo abertura"; "*_de_3_a_6_meses" → "De 3 a 6 meses". */
export function humanize(raw: string): string {
  const s = raw.replace(/^\*_?/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return raw;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function translate(value: unknown, dict: AnswerLabel | undefined): string {
  const optionText = (v: unknown) => {
    const key = display(v);
    const hit = dict?.options?.[key];
    if (hit) return hit;
    // códigos do tipo "n_o_tenho_o_capital" ficam legíveis mesmo sem dicionário
    return /^[a-z0-9_*]+$/.test(key) && key.includes("_") ? humanize(key) : key;
  };
  if (Array.isArray(value)) return value.map(optionText).filter(Boolean).join(", ");
  if (value && typeof value === "object") return display(value);
  return optionText(value);
}

export type LeadAnswer = { key: string; label: string; value: string };

/** Junta respostas do formulário (Lead Pro, Core, Make, Meta, Kommo) em uma lista legível. */
export function buildLeadAnswers(metadata: unknown, labels: AnswerLabel[] = []): LeadAnswer[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const meta = metadata as Record<string, unknown>;
  const byKey = new Map(labels.map((l) => [norm(l.field_key), l]));
  const out: LeadAnswer[] = [];
  const seen = new Set<string>();

  const push = (key: string, value: unknown, fallbackLabel?: string) => {
    const k = norm(key);
    if (!k || seen.has(k)) return;
    const dict = byKey.get(k);
    const text = translate(value, dict);
    if (!text) return;
    seen.add(k);
    out.push({ key, label: dict?.label ?? fallbackLabel ?? humanize(key), value: text });
  };

  const respostas = meta["respostas"];
  if (Array.isArray(respostas)) {
    respostas.forEach((item, i) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const row = item as Record<string, unknown>;
        const label = display(row["pergunta"] ?? row["label"] ?? row["campo"]) || `Resposta ${i + 1}`;
        push(display(row["key"] ?? row["campo"]) || label, row["resposta"] ?? row["value"] ?? row["valor"], label);
      } else {
        push(`resposta_${i + 1}`, item, `Resposta ${i + 1}`);
      }
    });
  } else if (respostas && typeof respostas === "object") {
    for (const [k, v] of Object.entries(respostas as Record<string, unknown>)) push(k, v);
  }

  for (const [k, v] of Object.entries(meta)) {
    if (SKIP.has(norm(k))) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) continue;
    push(k, v);
  }
  return out;
}

/** Origem dos dados do lead, para mostrar de onde o cadastro veio. */
export function leadOrigins(metadata: unknown, source: string | null | undefined): string[] {
  const out = new Set<string>();
  if (source) out.add(source);
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const m = metadata as Record<string, any>;
    if (m.lead_pro || m.schema_version || m.score?.total !== undefined) out.add("Lead Pro");
    if (m.origem === "formulario") out.add(m.form?.name ? `Formulário Core — ${m.form.name}` : "Formulário Core");
    if (m.kommo_id) out.add("Kommo");
  }
  return [...out];
}
