import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { getFormPreview } from "@/lib/forms/preview.functions";
import type { FormListItem } from "@/lib/forms/forms.functions";

export function FormPreviewDialog({
  open,
  onOpenChange,
  form,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: FormListItem | null;
}) {
  const previewFn = useServerFn(getFormPreview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["form-preview", form?.id],
    queryFn: () => previewFn({ data: { form_id: form!.id } }),
    enabled: open && !!form?.id,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Pré-visualização
          </DialogTitle>
          <DialogDescription>
            Simulação do formulário público de “{form?.name}”. Nenhuma resposta é gravada.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">Carregando perguntas…</p>
        ) : error ? (
          <p className="py-6 text-sm text-destructive">{(error as Error).message}</p>
        ) : data ? (
          <div className="rounded-xl bg-[#F6F8FA] p-4">
            <h2 className="text-lg font-semibold text-[#0F172A]">{data.name}</h2>
            {data.intro_message && (
              <p className="mb-3 mt-1 text-sm text-[#64748B]">{data.intro_message}</p>
            )}
            <div className="mt-3 rounded-xl bg-white p-4">
              <FormRenderer
                key={form?.id}
                form={data}
                preview
                onSubmit={(answers) =>
                  setResult(
                    computeSubmission(
                      data.questions.map((q) => ({
                        id: q.id,
                        question: q.question,
                        question_type: q.question_type,
                        required: q.required,
                        lead_field: q.lead_field ?? null,
                        options: q.options.map((o) => ({
                          id: o.id,
                          label: o.label,
                          value: o.value,
                          score: o.score ?? 0,
                        })),
                      })),
                      answers,
                    ),
                  )
                }
              />
            </div>

            {result && (
              <div className="mt-4 rounded-xl border border-[#E6EAF0] bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0F172A]">
                    Resultado do teste (nada foi salvo)
                  </p>
                  <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 font-mono text-[12.2px] tabular-nums text-[#0F172A]">
                    {result.score} pts · {result.temperature}
                  </span>
                </div>

                <p className="mt-3 text-[12.2px] font-medium uppercase tracking-wide text-[#64748B]">
                  Campos mapeados no lead
                </p>
                {Object.keys(result.lead).length ? (
                  <ul className="mt-1 grid gap-1 text-sm">
                    {Object.entries(result.lead).map(([k, v]) => (
                      <li key={k} className="flex justify-between gap-3">
                        <span className="text-[#64748B]">{k}</span>
                        <span className="truncate text-right text-[#0F172A]">{v}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-[#64748B]">
                    Nenhuma pergunta está mapeada para campos do lead.
                  </p>
                )}

                <p className="mt-3 text-[12.2px] font-medium uppercase tracking-wide text-[#64748B]">
                  Respostas
                </p>
                <ul className="mt-1 grid gap-1 text-sm">
                  {result.details.map((d) => (
                    <li key={d.question_id} className="flex justify-between gap-3">
                      <span className="text-[#64748B]">{d.question}</span>
                      <span className="text-right text-[#0F172A]">
                        {d.answer}
                        {d.score ? (
                          <span className="ml-1 font-mono text-[12.2px] text-[#22C55E]">
                            +{d.score}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>

                {form?.pipeline_name && (
                  <p className="mt-3 text-[12.2px] text-[#64748B]">
                    No envio real este lead entraria em <b>{form.pipeline_name}</b>
                    {form.stage_name ? ` · ${form.stage_name}` : ""}.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
