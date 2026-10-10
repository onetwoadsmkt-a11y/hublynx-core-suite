import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { FormDraft } from "@/lib/forms/domain";

type Rule = FormDraft["rules"][number];
type Condition = NonNullable<Rule["conditions"]["all"]>[number];
type Action = Rule["actions"][number];

const operators: Array<[Condition["operator"], string]> = [
  ["equals", "é igual a"],
  ["not_equals", "é diferente de"],
  ["contains", "contém"],
  ["not_contains", "não contém"],
  ["greater_than", "é maior que"],
  ["greater_or_equal", "é maior ou igual a"],
  ["less_than", "é menor que"],
  ["less_or_equal", "é menor ou igual a"],
  ["is_empty", "está vazio"],
  ["is_not_empty", "está preenchido"],
];

const actionLabels: Array<[Action["type"], string]> = [
  ["terminate", "Encerrar o preenchimento"],
  ["set_classification", "Alterar a classificação"],
  ["add_tag", "Adicionar etiqueta"],
  ["show_message", "Mostrar mensagem"],
  ["select_completion_page", "Escolher tela final"],
  ["redirect", "Redirecionar para um endereço"],
  ["skip_to_field", "Pular para a pergunta"],
  ["continue", "Continuar normalmente"],
];

export function RulesEditor({
  draft,
  formId,
  onChange,
}: {
  draft: FormDraft;
  formId: string;
  onChange: (rules: FormDraft["rules"]) => void;
}) {
  // No Core Suite o lead já entra no pipeline; integrações externas ficam nos webhooks do CRM.
  const integrations: Array<{ id: string; name: string }> = [];
  void formId;
  const factOptions = [
    ...draft.fields.map((field) => ({ value: `answers.${field.key}`, label: field.label })),
    { value: "score", label: "Pontuação total" },
    { value: "classification", label: "Classificação por faixa" },
  ];

  const updateRule = (index: number, update: Partial<Rule>) =>
    onChange(draft.rules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...update } : rule)));

  const optionsForFact = (fact: string) => {
    const key = fact.replace(/^answers\./, "");
    const field = draft.fields.find((item) => item.key === key);
    if (!field) return [];
    if (field.kind === "boolean") {
      return [
        { value: "yes", label: "Sim", score: 0, position: 0 },
        { value: "no", label: "Não", score: 0, position: 1 },
      ];
    }
    return field.options ?? [];
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Regras condicionais</h2>
          <p className="text-sm text-muted-foreground">Se a condição acontecer, as ações abaixo são aplicadas na ordem de prioridade.</p>
        </div>
        <Button
          size="sm"
          onClick={() =>
            onChange([
              ...draft.rules,
              {
                name: `Regra ${draft.rules.length + 1}`,
                triggerEvent: "answer_changed",
                priority: (draft.rules.at(-1)?.priority ?? 90) + 10,
                enabled: true,
                stopProcessing: false,
                conditions: { all: [{ fact: factOptions[0]?.value ?? "score", operator: "equals", value: "" }] },
                actions: [{ type: "terminate" }],
              },
            ])
          }
        >
          <Plus className="size-4" /> Nova regra
        </Button>
      </div>

      {draft.rules.length === 0 ? (
        <div className="border border-dashed border-border bg-background p-8 text-center text-sm text-muted-foreground">
          Nenhuma regra criada. Use regras para encerrar o preenchimento, mudar a classificação ou escolher outra tela final.
        </div>
      ) : null}

      {draft.rules.map((rule, index) => {
        const conditions = rule.conditions.all ?? [];
        return (
          <div key={index} className="card-surface space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-center">
              <Input value={rule.name} onChange={(event) => updateRule(index, { name: event.target.value })} aria-label="Nome da regra" />
              <Input
                type="number"
                value={rule.priority}
                onChange={(event) => updateRule(index, { priority: Number(event.target.value) })}
                aria-label="Prioridade"
              />
              <div className="flex items-center justify-end gap-3">
                <div className="flex items-center gap-2">
                  <Switch checked={rule.enabled} onCheckedChange={(enabled) => updateRule(index, { enabled })} id={`rule-enabled-${index}`} />
                  <Label htmlFor={`rule-enabled-${index}`} className="text-xs">Ativa</Label>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Excluir regra"
                  onClick={() => onChange(draft.rules.filter((_, ruleIndex) => ruleIndex !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Se</p>
              {conditions.map((condition, conditionIndex) => {
                const choices = optionsForFact(condition.fact);
                const setCondition = (update: Partial<Condition>) =>
                  updateRule(index, {
                    conditions: {
                      all: conditions.map((item, itemIndex) => (itemIndex === conditionIndex ? { ...item, ...update } : item)),
                    },
                  });
                return (
                  <div key={conditionIndex} className="grid gap-2 sm:grid-cols-[1fr_170px_1fr_36px]">
                    <Select value={condition.fact} onValueChange={(value) => setCondition({ fact: value, value: "" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {factOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={condition.operator} onValueChange={(value) => setCondition({ operator: value as Condition["operator"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(choices.length ? operators.filter(([value]) => ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"].includes(value)) : operators).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {condition.operator === "is_empty" || condition.operator === "is_not_empty" ? (
                      <div className="text-sm text-muted-foreground sm:pt-2">—</div>
                    ) : choices.length ? (
                      <Select value={String(condition.value ?? "")} onValueChange={(value) => setCondition({ value })}>
                        <SelectTrigger><SelectValue placeholder="Escolha a resposta" /></SelectTrigger>
                        <SelectContent>
                          {choices.map((choice) => (
                            <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={String(condition.value ?? "")}
                        onChange={(event) => setCondition({ value: event.target.value })}
                        placeholder="Valor"
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover condição"
                      onClick={() =>
                        updateRule(index, { conditions: { all: conditions.filter((_, itemIndex) => itemIndex !== conditionIndex) } })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  updateRule(index, {
                    conditions: { all: [...conditions, { fact: factOptions[0]?.value ?? "score", operator: "equals", value: "" }] },
                  })
                }
              >
                <Plus className="size-4" /> Condição
              </Button>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Então</p>
              {rule.actions.map((action, actionIndex) => {
                const setAction = (update: Partial<Action>) =>
                  updateRule(index, {
                    actions: rule.actions.map((item, itemIndex) => (itemIndex === actionIndex ? { ...item, ...update } : item)),
                  });
                const needsValue = action.type !== "terminate" && action.type !== "continue";
                return (
                  <div key={actionIndex} className="grid gap-2 sm:grid-cols-[1fr_1fr_36px]">
                    <Select value={action.type} onValueChange={(value) => setAction({ type: value as Action["type"], value: "" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {actionLabels.map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {action.type === "set_classification" ? (
                      <Select value={action.value ?? ""} onValueChange={(value) => setAction({ value })}>
                        <SelectTrigger><SelectValue placeholder="Classificação" /></SelectTrigger>
                        <SelectContent>
                          {draft.ranges.map((range) => (
                            <SelectItem key={range.slug} value={range.slug}>{range.name}</SelectItem>
                          ))}
                          <SelectItem value="nutrition">Nutrição</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : action.type === "select_completion_page" ? (
                      <Select value={action.value ?? ""} onValueChange={(value) => setAction({ value })}>
                        <SelectTrigger><SelectValue placeholder="Tela final" /></SelectTrigger>
                        <SelectContent>
                          {draft.completionPages.map((page) => (
                            <SelectItem key={page.key} value={page.key}>{page.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : action.type === "skip_to_field" ? (
                      <Select value={action.value ?? ""} onValueChange={(value) => setAction({ value })}>
                        <SelectTrigger><SelectValue placeholder="Pular para a pergunta" /></SelectTrigger>
                        <SelectContent>
                          {draft.fields.map((item) => (
                            <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : action.type === "trigger_integration" ? (
                      <Select
                        value={action.integrationId ?? action.value ?? ""}
                        onValueChange={(value) => setAction({ integrationId: value, value })}
                      >
                        <SelectTrigger><SelectValue placeholder={integrations.length ? "Escolha a integração" : "Nenhuma integração criada"} /></SelectTrigger>
                        <SelectContent>
                          {integrations.map((item) => (
                            <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : needsValue ? (
                      <Input
                        value={action.value ?? ""}
                        onChange={(event) => setAction({ value: event.target.value })}
                        placeholder={action.type === "redirect" ? "https://..." : action.type === "add_tag" ? "Nome da etiqueta" : action.type === "show_message" ? "Mensagem para a pessoa" : "Valor"}
                      />
                    ) : action.type === "terminate" ? (
                      <Select value={action.completionPageKey ?? ""} onValueChange={(value) => setAction({ completionPageKey: value })}>
                        <SelectTrigger><SelectValue placeholder="Tela final ao encerrar" /></SelectTrigger>
                        <SelectContent>
                          {draft.completionPages.map((page) => (
                            <SelectItem key={page.key} value={page.key}>{page.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover ação"
                      onClick={() => updateRule(index, { actions: rule.actions.filter((_, itemIndex) => itemIndex !== actionIndex) })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => updateRule(index, { actions: [...rule.actions, { type: "add_tag", value: "" }] })}>
                  <Plus className="size-4" /> Ação
                </Button>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`stop-${index}`}
                    checked={rule.stopProcessing}
                    onCheckedChange={(stopProcessing) => updateRule(index, { stopProcessing })}
                  />
                  <Label htmlFor={`stop-${index}`} className="text-xs">Parar após esta regra</Label>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
