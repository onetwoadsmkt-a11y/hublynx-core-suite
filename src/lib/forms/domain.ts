import { z } from "zod";

export const fieldKinds = [
  "text",
  "name",
  "email",
  "phone",
  "city",
  "state",
  "single_choice",
  "multi_choice",
  "boolean",
  "number",
] as const;

export const fieldKindLabels: Record<(typeof fieldKinds)[number], string> = {
  text: "Texto",
  name: "Nome",
  email: "E-mail",
  phone: "Telefone / WhatsApp",
  city: "Cidade",
  state: "Estado",
  single_choice: "Seleção única",
  multi_choice: "Seleção múltipla",
  boolean: "Sim / Não",
  number: "Número",
};

export const formModeSchema = z.enum(["scoring", "direct"]);
export type FormMode = z.infer<typeof formModeSchema>;

export const formOptionSchema = z.object({
  id: z.string().uuid().optional(),
  value: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  score: z.number().min(-10000).max(10000).default(0),
  position: z.number().int().min(0),
});

export const formFieldSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  kind: z.enum(fieldKinds),
  section: z.enum(["identity", "qualification"]),
  label: z.string().trim().min(1).max(240),
  description: z.string().trim().max(500).nullable().default(null),
  placeholder: z.string().trim().max(200).nullable().default(null),
  required: z.boolean().default(false),
  active: z.boolean().default(true),
  position: z.number().int().min(0),
  validation: z.record(z.string(), z.unknown()).default({}),
  settings: z.record(z.string(), z.unknown()).default({}),
  options: z.array(formOptionSchema).max(100).default([]),
});

export const scoreRangeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  minScore: z.number().min(-100000).max(100000),
  maxScore: z.number().min(-100000).max(100000),
  visualToken: z.enum(["neutral", "cold", "warm", "hot", "success"]).default("neutral"),
  position: z.number().int().min(0),
});

const conditionSchema = z.object({
  fact: z.string().min(1).max(180),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "greater_than",
    "greater_or_equal",
    "less_than",
    "less_or_equal",
    "is_empty",
    "is_not_empty",
  ]),
  value: z.unknown().optional(),
});

export const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  triggerEvent: z.enum(["answer_changed", "before_next", "submission_completed"]),
  priority: z.number().int().min(0).max(10000).default(100),
  enabled: z.boolean().default(true),
  stopProcessing: z.boolean().default(false),
  conditions: z.object({
    all: z.array(conditionSchema).max(20).optional(),
    any: z.array(conditionSchema).max(20).optional(),
  }),
  actions: z.array(
    z.object({
      type: z.enum([
        "continue",
        "skip_to_field",
        "terminate",
        "set_classification",
        "add_tag",
        "show_message",
        "select_completion_page",
        "redirect",
        "trigger_integration",
      ]),
      value: z.string().max(1000).optional(),
      completionPageKey: z.string().max(120).optional(),
      integrationId: z.string().uuid().optional(),
    }),
  ).max(20),
});

export const appearanceSchema = z.object({
  presetKey: z.enum(["focus", "split", "immersive"]).default("focus"),
  tokens: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFCB01"),
    secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#111111"),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
    text: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#171717"),
    radius: z.enum(["none", "small", "medium", "large"]).default("medium"),
  }),
  assets: z.record(
    z.string(),
    z.string().refine((value) => value.startsWith("/") || URL.canParse(value), "Informe uma URL válida."),
  ).default({}),
  copy: z.record(z.string(), z.string().max(500)).default({}),
});

export const completionPageSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).default(""),
  buttonLabel: z.string().trim().max(80).nullable().default(null),
  actionType: z.enum(["none", "url", "asset", "redirect"]).default("none"),
  actionTarget: z.string().trim().max(1000).nullable().default(null),
});

export const formDraftSchema = z.object({
  formId: z.string().uuid(),
  mode: formModeSchema.default("scoring"),
  name: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  fields: z.array(formFieldSchema).max(100),
  ranges: z.array(scoreRangeSchema).max(30),
  rules: z.array(ruleSchema).max(100),
  appearance: appearanceSchema,
  completionPages: z.array(completionPageSchema).min(1).max(20),
});

export type FormDraft = z.infer<typeof formDraftSchema>;
export type FormField = z.infer<typeof formFieldSchema>;
export type FormRule = z.infer<typeof ruleSchema>;

export function calculatePossibleScoreRange(fields: FormDraft["fields"]) {
  return fields.reduce(
    (range, field) => {
      if (field.active === false || field.options.length === 0) return range;
      const scores = field.options.map((option) => option.score);
      if (field.kind === "multi_choice") {
        return {
          minPossible: range.minPossible + scores.filter((score) => score < 0).reduce((sum, score) => sum + score, 0),
          maxPossible: range.maxPossible + scores.filter((score) => score > 0).reduce((sum, score) => sum + score, 0),
        };
      }
      if (field.kind === "single_choice" || field.kind === "boolean") {
        return {
          minPossible: range.minPossible + Math.min(...scores),
          maxPossible: range.maxPossible + Math.max(...scores),
        };
      }
      return range;
    },
    { minPossible: 0, maxPossible: 0 },
  );
}

export function validateScoreRanges(ranges: FormDraft["ranges"]) {
  if (ranges.length === 0) return ["Crie ao menos uma faixa de classificação."];
  const sorted = [...ranges].sort((a, b) => a.minScore - b.minScore);
  const errors: string[] = [];
  sorted.forEach((range, index) => {
    if (range.minScore > range.maxScore) errors.push(`${range.name}: o mínimo supera o máximo.`);
    const previous = sorted[index - 1];
    if (previous && range.minScore <= previous.maxScore) {
      errors.push(`${previous.name} e ${range.name} possuem pontuações sobrepostas.`);
    }
    if (previous && range.minScore > previous.maxScore + 1) {
      errors.push(`Existe uma lacuna entre ${previous.name} e ${range.name}.`);
    }
  });
  return errors;
}

export function validateScoreRangeCoverage(
  ranges: FormDraft["ranges"],
  { minPossible, maxPossible }: { minPossible: number; maxPossible: number },
) {
  if (ranges.length === 0) return ["Este formulário não tem faixas de classificação. Crie faixas que cubram toda a pontuação possível."];
  const sorted = [...ranges].sort((a, b) => a.minScore - b.minScore);
  const lowest = sorted[0];
  const highest = sorted.reduce((current, range) => range.maxScore > current.maxScore ? range : current);
  if (!lowest || !highest) return [];
  const errors: string[] = [];
  if (lowest.minScore > minPossible) {
    errors.push(`As faixas começam em ${lowest.minScore} pontos, mas este formulário pode chegar a ${minPossible}. Ajuste a faixa mais baixa.`);
  }
  if (highest.maxScore < maxPossible) {
    errors.push(`As faixas vão até ${highest.maxScore} pontos, mas este formulário pode somar até ${maxPossible}. Ajuste a faixa mais alta.`);
  }
  return errors;
}

export function validateScoringQuestions(fields: FormDraft["fields"]) {
  const activeQualificationFields = fields.filter(
    (field) => field.active !== false && field.section === "qualification",
  );
  return activeQualificationFields.length > 0
    ? []
    : ["Ative ao menos uma pergunta de qualificação para usar o modo lead scoring."];
}

export function compileDefinition(draft: FormDraft) {
  const usesScoring = draft.mode === "scoring";
  return {
    schemaVersion: 2,
    mode: draft.mode,
    name: draft.name,
    slug: draft.slug,
    fields: [...draft.fields]
      .filter((field) => field.active !== false)
      .sort((a, b) => a.position - b.position)
      .map(({ id: _id, active: _active, options, ...field }) => ({
        ...field,
        options: options.map(({ id: _optionId, ...option }) => option),
      })),
    scoreRanges: usesScoring ? [...draft.ranges].sort((a, b) => a.position - b.position).map(({ id: _id, ...range }) => range) : [],
    rules: usesScoring ? [...draft.rules].filter((rule) => rule.enabled).sort((a, b) => a.priority - b.priority).map(({ id: _id, ...rule }) => rule) : [],
    appearance: draft.appearance,
    completionPages: draft.completionPages.map(({ id: _id, ...page }) => page),
  };
}