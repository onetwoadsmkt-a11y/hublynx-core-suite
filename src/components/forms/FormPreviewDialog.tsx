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
              <FormRenderer form={data} preview />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
