import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listFormQuestions,
  saveFormQuestions,
  type EditorQuestion,
  type QuestionType,
} from "@/lib/forms/questions.functions";
import type { FormListItem } from "@/lib/forms/forms.functions";

const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: "Escolha única (botões)",
  multi_choice: "Múltipla escolha",
  short_text: "Texto curto",
  long_text: "Texto longo",
  email: "E-mail",
  phone: "Telefone / WhatsApp",
  number: "Número",
  date: "Data",
  rating: "Avaliação (1–5)",
  consent: "Consentimento (aceite)",
};

const LEAD_FIELDS = [
  { value: "__none", label: "Não mapear" },
  { value: "name", label: "Nome do lead" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "company", label: "Empresa" },
  { value: "city", label: "Cidade" },
  { value: "state", label: "Estado" },
  { value: "value", label: "Valor potencial" },
];

const CHOICE_TYPES: QuestionType[] = ["single_choice", "multi_choice"];

type Draft = EditorQuestion & { key: string };

const newKey = () => Math.random().toString(36).slice(2, 10);

function blankQuestion(): Draft {
  return {
    key: newKey(),
    id: null,
    question: "",
    help_text: null,
    question_type: "single_choice",
    required: true,
    lead_field: null,
    options: [
      { id: null, label: "", value: null, score: 0 },
      { id: null, label: "", value: null, score: 0 },
    ],
  };
}

export function QuestionsEditorDialog({
  open,
  onOpenChange,
  form,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: FormListItem | null;
}) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const listFn = useServerFn(listFormQuestions);
  const { data, isLoading } = useQuery({
    queryKey: ["form-questions", form?.id],
    queryFn: () => listFn({ data: { form_id: form!.id } }),
    enabled: open && !!form?.id,
  });

  useEffect(() => {
    if (!open || !data) return;
    setDrafts(data.map((q) => ({ ...q, key: newKey() })));
  }, [open, data]);

  const patch = (key: string, next: Partial<Draft>) =>
    setDrafts((d) => d.map((q) => (q.key === key ? { ...q, ...next } : q)));

  const move = (index: number, dir: -1 | 1) =>
    setDrafts((d) => {
      const target = index + dir;
      if (target < 0 || target >= d.length) return d;
      const copy = [...d];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item!);
      return copy;
    });

  const saveFn = useServerFn(saveFormQuestions);
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          form_id: form!.id,
          questions: drafts.map((q) => ({
            id: q.id,
            question: q.question.trim(),
            help_text: q.help_text?.trim() || null,
            question_type: q.question_type,
            required: q.required,
            lead_field: q.lead_field,
            options: CHOICE_TYPES.includes(q.question_type)
              ? q.options
                  .filter((o) => o.label.trim())
                  .map((o) => ({
                    id: o.id,
                    label: o.label.trim(),
                    value: o.value?.trim() || null,
                    score: Number.isFinite(o.score) ? o.score : 0,
                  }))
              : [],
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Perguntas salvas");
      qc.invalidateQueries({ queryKey: ["form-questions", form?.id] });
      qc.invalidateQueries({ queryKey: ["forms"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalid = drafts.some(
    (q) =>
      !q.question.trim() ||
      (CHOICE_TYPES.includes(q.question_type) &&
        q.options.filter((o) => o.label.trim()).length < 2),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Perguntas — {form?.name}</DialogTitle>
          <DialogDescription>
            Monte o roteiro do formulário. A ordem aqui é a ordem em que as perguntas aparecem
            para quem responde. A pontuação de cada alternativa será usada no Lead Scoring.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 space-y-3 overflow-y-auto px-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando perguntas…</p>
          ) : !drafts.length ? (
            <Card className="p-8 text-center">
              <p className="font-medium">Nenhuma pergunta ainda</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Adicione a primeira pergunta do seu formulário conversacional.
              </p>
            </Card>
          ) : (
            drafts.map((q, i) => {
              const isChoice = CHOICE_TYPES.includes(q.question_type);
              return (
                <Card key={q.key} className="space-y-3 p-4">
                  <div className="flex items-start gap-2">
                    <div className="mt-2 flex flex-col items-center gap-1 text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                      <span className="font-mono text-[11px] tabular-nums">{i + 1}</span>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Input
                        value={q.question}
                        maxLength={300}
                        placeholder="Qual o capital disponível para investimento?"
                        onChange={(e) => patch(q.key, { question: e.target.value })}
                      />
                      <Input
                        value={q.help_text ?? ""}
                        maxLength={500}
                        placeholder="Texto de apoio (opcional)"
                        className="text-[12.2px]"
                        onChange={(e) => patch(q.key, { help_text: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        aria-label="Mover para cima"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={i === drafts.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label="Mover para baixo"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDrafts((d) => d.filter((x) => x.key !== q.key))}
                        aria-label="Excluir pergunta"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-[12.2px] text-muted-foreground">Tipo</Label>
                      <Select
                        value={q.question_type}
                        onValueChange={(v) =>
                          patch(q.key, {
                            question_type: v as QuestionType,
                            options:
                              CHOICE_TYPES.includes(v as QuestionType) && !q.options.length
                                ? [
                                    { id: null, label: "", value: null, score: 0 },
                                    { id: null, label: "", value: null, score: 0 },
                                  ]
                                : q.options,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[12.2px] text-muted-foreground">
                        Campo do lead
                      </Label>
                      <Select
                        value={q.lead_field ?? "__none"}
                        onValueChange={(v) =>
                          patch(q.key, { lead_field: v === "__none" ? null : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_FIELDS.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-end justify-between gap-2 pb-1">
                      <Label
                        htmlFor={`req-${q.key}`}
                        className="text-[12.2px] text-muted-foreground"
                      >
                        Obrigatória
                      </Label>
                      <Switch
                        id={`req-${q.key}`}
                        checked={q.required}
                        onCheckedChange={(v) => patch(q.key, { required: v })}
                      />
                    </div>
                  </div>

                  {isChoice && (
                    <div className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[12.2px] text-muted-foreground">
                          Alternativas
                        </span>
                        <Badge variant="secondary" className="text-[11px]">
                          pontuação → Lead Scoring
                        </Badge>
                      </div>
                      {q.options.map((o, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <Input
                            value={o.label}
                            maxLength={160}
                            placeholder={`Alternativa ${j + 1}`}
                            onChange={(e) =>
                              patch(q.key, {
                                options: q.options.map((x, k) =>
                                  k === j ? { ...x, label: e.target.value } : x,
                                ),
                              })
                            }
                          />
                          <Input
                            type="number"
                            value={o.score}
                            className="w-24 text-right font-mono tabular-nums"
                            onChange={(e) =>
                              patch(q.key, {
                                options: q.options.map((x, k) =>
                                  k === j
                                    ? { ...x, score: Number(e.target.value) || 0 }
                                    : x,
                                ),
                              })
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive"
                            onClick={() =>
                              patch(q.key, {
                                options: q.options.filter((_, k) => k !== j),
                              })
                            }
                            aria-label="Remover alternativa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          patch(q.key, {
                            options: [
                              ...q.options,
                              { id: null, label: "", value: null, score: 0 },
                            ],
                          })
                        }
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Alternativa
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setDrafts((d) => [...d, blankQuestion()])}
          >
            <Plus className="mr-2 h-4 w-4" /> Adicionar pergunta
          </Button>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <span className="text-[12.2px] text-muted-foreground">
            {invalid
              ? "Preencha o texto de cada pergunta e ao menos 2 alternativas nas de escolha."
              : `${drafts.length} pergunta(s)`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar perguntas"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
