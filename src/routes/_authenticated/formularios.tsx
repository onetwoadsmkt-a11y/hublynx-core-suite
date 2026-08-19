import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  ExternalLink,
  Files,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  ListChecks,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FormDialog } from "@/components/forms/FormDialog";
import { QuestionsEditorDialog } from "@/components/forms/QuestionsEditorDialog";
import {
  listForms,
  setFormStatus,
  duplicateForm,
  deleteForm,
  type FormListItem,
} from "@/lib/forms/forms.functions";
import { formatDateBR } from "@/lib/finance/format";

export const Route = createFileRoute("/_authenticated/formularios")({
  head: () => ({
    meta: [
      { title: "Hublynx Forms — Formulários de captação" },
      {
        name: "description",
        content:
          "Crie formulários inteligentes para captar e qualificar novos leads diretamente no seu Pipeline de Vendas.",
      },
      { property: "og:title", content: "Hublynx Forms — Formulários de captação" },
      {
        property: "og:description",
        content: "Formulários de captação de leads integrados ao Pipeline de Vendas do Hublynx.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FormulariosPage,
});

const STATUS_META: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-slate-100 text-slate-600" },
  publicado: { label: "Publicado", className: "bg-emerald-100 text-emerald-700" },
  pausado: { label: "Pausado", className: "bg-amber-100 text-amber-700" },
};

function publicUrl(slug: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/form/${slug}`;
}

function FormulariosPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FormListItem | null>(null);
  const [toDelete, setToDelete] = useState<FormListItem | null>(null);
  const [questionsFor, setQuestionsFor] = useState<FormListItem | null>(null);

  const listFn = useServerFn(listForms);
  const { data: forms, isLoading } = useQuery({
    queryKey: ["forms"],
    queryFn: () => listFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["forms"] });

  const statusFn = useServerFn(setFormStatus);
  const status = useMutation({
    mutationFn: (v: { id: string; status: "rascunho" | "publicado" | "pausado" }) =>
      statusFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.status === "publicado" ? "Formulário publicado" : "Formulário pausado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dupFn = useServerFn(duplicateForm);
  const duplicate = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Formulário duplicado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delFn = useServerFn(deleteForm);
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Formulário excluído");
      setToDelete(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyLink = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(publicUrl(slug));
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  return (
    <div className="container mx-auto space-y-6 px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hublynx Forms</h1>
          <p className="text-sm text-muted-foreground">
            Crie formulários inteligentes para captar e qualificar novos leads diretamente no seu
            Pipeline de Vendas.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Novo formulário
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Carregando formulários…</Card>
      ) : !forms?.length ? (
        <Card className="p-10 text-center">
          <p className="font-medium">Nenhum formulário ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie o primeiro formulário e comece a receber leads qualificados.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Novo formulário
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {forms.map((f) => {
            const meta = STATUS_META[f.status] ?? STATUS_META["rascunho"]!;
            return (
              <Card key={f.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{f.name}</p>
                    {f.description && (
                      <p className="mt-0.5 line-clamp-2 text-[12.2px] text-muted-foreground">
                        {f.description}
                      </p>
                    )}
                  </div>
                  <Badge className={`shrink-0 border-0 ${meta.className}`}>{meta.label}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.2px] text-muted-foreground">
                  <span>Pipeline</span>
                  <span className="truncate text-right text-foreground">
                    {f.pipeline_name ?? "—"}
                  </span>
                  <span>Etapa de entrada</span>
                  <span className="truncate text-right text-foreground">
                    {f.stage_name ?? "—"}
                  </span>
                  <span>Respostas</span>
                  <span className="text-right font-mono tabular-nums text-foreground">
                    {f.responses}
                  </span>
                  <span>Criado em</span>
                  <span className="text-right">{formatDateBR(f.created_at)}</span>
                  <span>Última resposta</span>
                  <span className="text-right">
                    {f.last_response_at ? formatDateBR(f.last_response_at) : "—"}
                  </span>
                </div>

                <div className="mt-auto flex items-center gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(f);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setQuestionsFor(f)}>
                    <ListChecks className="mr-1.5 h-3.5 w-3.5" /> Perguntas
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => copyLink(f.slug)}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Link
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="ml-auto">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <a href={`/form/${f.slug}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" /> Visualizar
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicate.mutate(f.id)}>
                        <Files className="mr-2 h-4 w-4" /> Duplicar
                      </DropdownMenuItem>
                      {f.status === "publicado" ? (
                        <DropdownMenuItem
                          onClick={() => status.mutate({ id: f.id, status: "pausado" })}
                        >
                          <Pause className="mr-2 h-4 w-4" /> Pausar
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => status.mutate({ id: f.id, status: "publicado" })}
                        >
                          <Play className="mr-2 h-4 w-4" /> Publicar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setToDelete(f)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <FormDialog open={dialogOpen} onOpenChange={setDialogOpen} form={editing} />

      <QuestionsEditorDialog
        open={!!questionsFor}
        onOpenChange={(v) => !v && setQuestionsFor(null)}
        form={questionsFor}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir formulário?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toDelete?.name}” e todas as respostas registradas serão removidos. Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
