/** Lógica compartilhada entre a prévia (teste, sem gravar) e o envio público real. */

export type FormAnswer = string | string[] | boolean | null;

export type ScoringOption = {
  id: string;
  label: string;
  value: string | null;
  score?: number | null;
};

export type ScoringQuestion = {
  id: string;
  question: string;
  question_type: string;
  required: boolean;
  lead_field?: string | null;
  options: ScoringOption[];
};

export type AnswerDetail = {
  question_id: string;
  question: string;
  option_id: string | null;
  answer: string | null;
  score: number;
  lead_field: string | null;
};

export type SubmissionResult = {
  lead: Record<string, string>;
  score: number;
  temperature: "quente" | "morno" | "frio";
  missing: { id: string; question: string }[];
  details: AnswerDetail[];
};

const NUMERIC_FIELDS = new Set(["value"]);

function asText(a: FormAnswer): string | null {
  if (a === null || a === undefined) return null;
  if (typeof a === "boolean") return a ? "Sim" : "Não";
  if (Array.isArray(a)) return a.length ? a.join(", ") : null;
  const s = a.trim();
  return s ? s : null;
}

export function temperatureFromScore(score: number): "quente" | "morno" | "frio" {
  if (score >= 70) return "quente";
  if (score >= 35) return "morno";
  return "frio";
}

/** Calcula pontuação, temperatura, campos do lead e pendências de obrigatoriedade. */
export function computeSubmission(
  questions: ScoringQuestion[],
  answers: Record<string, FormAnswer>,
): SubmissionResult {
  const lead: Record<string, string> = {};
  const missing: { id: string; question: string }[] = [];
  const details: AnswerDetail[] = [];
  let score = 0;

  for (const q of questions) {
    const raw = answers[q.id] ?? null;
    const text = asText(raw);

    if (q.required && (text === null || (q.question_type === "consent" && raw !== true))) {
      missing.push({ id: q.id, question: q.question });
    }
    if (text === null) continue;

    const selected = Array.isArray(raw) ? raw : [raw];
    const matched = q.options.filter((o) =>
      selected.some((s) => typeof s === "string" && (s === o.label || s === o.value)),
    );
    const qScore = matched.reduce((sum, o) => sum + (o.score ?? 0), 0);
    score += qScore;

    details.push({
      question_id: q.id,
      question: q.question,
      option_id: matched.length === 1 ? matched[0]!.id : null,
      answer: text,
      score: qScore,
      lead_field: q.lead_field ?? null,
    });

    const field = q.lead_field?.trim();
    if (field && !lead[field]) {
      lead[field] = NUMERIC_FIELDS.has(field)
        ? text.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
        : text.slice(0, 300);
    }
  }

  return { lead, score, temperature: temperatureFromScore(score), missing, details };
}
