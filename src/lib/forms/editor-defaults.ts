import type { FormDraft } from "./domain";

/** Converte qualquer valor opcional de texto em string, nunca undefined/null. */
export function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

/** Garante valores padrão em todo o rascunho carregado no editor. */
export function normalizeFormDraft(draft: FormDraft): FormDraft {
  return {
    ...draft,
    name: text(draft.name),
    slug: text(draft.slug),
    mode: draft.mode === "direct" ? "direct" : "scoring",
    fields: (draft.fields ?? []).map((field, index) => ({
      ...field,
      label: text(field.label),
      key: text(field.key),
      description: field.description ?? null,
      placeholder: field.placeholder ?? null,
      required: field.required !== false,
      active: field.active !== false,
      position: field.position ?? index,
      validation: field.validation ?? {},
      settings: field.settings ?? {},
      options: (field.options ?? []).map((option, optionIndex) => ({
        ...option,
        value: text(option.value),
        label: text(option.label),
        score: Number(option.score ?? 0),
        position: option.position ?? optionIndex,
      })),
    })),
    ranges: draft.ranges ?? [],
    rules: draft.rules ?? [],
    appearance: {
      ...draft.appearance,
      assets: draft.appearance?.assets ?? {},
      copy: draft.appearance?.copy ?? {},
    },
    completionPages: (draft.completionPages ?? []).map((page) => ({
      ...page,
      title: text(page.title),
      description: text(page.description),
      buttonLabel: page.buttonLabel ?? null,
      actionTarget: page.actionTarget ?? null,
    })),
  };
}

export type IntegrationDraftDefaults = {
  name: string;
  adapterType: "webhook" | "core_suite";
  makeWebhookUrl: string;
  endpointUrl: string;
  coreBaseUrl: string;
  coreToken: string;
  headerName: string;
  headerValue: string;
  classification: string;
};

/** Garante que todo campo de texto de uma integração seja string. */
export function normalizeIntegrationDraft<T extends Partial<IntegrationDraftDefaults>>(draft: T): T & IntegrationDraftDefaults {
  return {
    ...draft,
    name: text(draft.name),
    adapterType: draft.adapterType === "core_suite" ? "core_suite" : "webhook",
    makeWebhookUrl: text(draft.makeWebhookUrl),
    endpointUrl: text(draft.endpointUrl),
    coreBaseUrl: text(draft.coreBaseUrl),
    coreToken: text(draft.coreToken),
    headerName: text(draft.headerName),
    headerValue: text(draft.headerValue),
    classification: text(draft.classification) || "all",
  };
}
