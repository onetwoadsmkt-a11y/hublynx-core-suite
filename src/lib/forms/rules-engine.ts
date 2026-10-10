import type { FormRule } from "./domain";

type Facts = Record<string, unknown>;

export type RuleOutcome = {
  classification?: string;
  tags: string[];
  completionPageKey?: string;
  terminated: boolean;
  selectedCompletionPage: boolean;
  redirect?: string;
  message?: string;
  skipToFieldKey?: string;
  integrations: string[];
};

function readFact(facts: Facts, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, facts);
}

function matches(actual: unknown, operator: string, expected: unknown): boolean {
  if (operator === "is_empty") return actual == null || actual === "" || (Array.isArray(actual) && actual.length === 0);
  if (operator === "is_not_empty") return !matches(actual, "is_empty", expected);
  // Múltipla escolha grava um array: "igual a" significa "a alternativa foi marcada".
  if (operator === "equals") return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
  if (operator === "not_equals") return !matches(actual, "equals", expected);
  if (operator === "contains") return Array.isArray(actual) ? actual.includes(expected) : String(actual ?? "").includes(String(expected ?? ""));
  if (operator === "not_contains") return !matches(actual, "contains", expected);
  const left = Number(actual);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (operator === "greater_than") return left > right;
  if (operator === "greater_or_equal") return left >= right;
  if (operator === "less_than") return left < right;
  if (operator === "less_or_equal") return left <= right;
  return false;
}

function ruleMatches(rule: FormRule, facts: Facts) {
  const test = (condition: { fact: string; operator: string; value?: unknown }) =>
    matches(readFact(facts, condition.fact), condition.operator, condition.value);
  const all = rule.conditions.all ?? [];
  const any = rule.conditions.any ?? [];
  return all.every(test) && (any.length === 0 || any.some(test));
}

export function evaluateRules(rules: FormRule[], facts: Facts): RuleOutcome {
  const outcome: RuleOutcome = { tags: [], terminated: false, selectedCompletionPage: false, integrations: [] };
  for (const rule of [...rules].filter((item) => item.enabled).sort((a, b) => a.priority - b.priority).slice(0, 100)) {
    if (!ruleMatches(rule, facts)) continue;
    for (const action of rule.actions.slice(0, 20)) {
      if (action.type === "set_classification" && action.value) outcome.classification = action.value;
      if (action.type === "add_tag" && action.value && !outcome.tags.includes(action.value)) outcome.tags.push(action.value);
      if (action.type === "terminate") {
        outcome.terminated = true;
        if (action.completionPageKey) outcome.completionPageKey = action.completionPageKey;
      }
      // Escolher tela final encerra as perguntas restantes e leva direto para essa tela.
      if (action.type === "select_completion_page" && action.value) {
        outcome.completionPageKey = action.value;
        outcome.selectedCompletionPage = true;
      }
      if (action.type === "redirect" && action.value) outcome.redirect = action.value;
      if (action.type === "show_message" && action.value) outcome.message = action.value;
      if (action.type === "skip_to_field" && action.value) outcome.skipToFieldKey = action.value.replace(/^answers\./, "");
      if (action.type === "trigger_integration") {
        const integrationId = action.integrationId ?? action.value;
        if (integrationId) outcome.integrations.push(integrationId);
      }
    }
    if (rule.stopProcessing) break;
  }
  return outcome;
}

export function calculateConfiguredScore(
  fields: Array<{ key: string; kind: string; options: Array<{ value: string; score: number }> }>,
  answers: Record<string, unknown>,
) {
  const breakdown: Array<{ fieldKey: string; optionValue: string; points: number }> = [];
  let total = 0;
  for (const field of fields) {
    const answer = answers[field.key];
    const selected: unknown[] = Array.isArray(answer) ? answer : [answer];
    for (const option of field.options) {
      if (!selected.includes(option.value)) continue;
      total += option.score;
      breakdown.push({ fieldKey: field.key, optionValue: option.value, points: option.score });
    }
  }
  return { total, breakdown };
}