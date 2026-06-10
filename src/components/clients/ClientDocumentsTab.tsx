import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listClientDocuments,
  uploadClientDocument,
  deleteClientDocument,
  type ClientDocument,
} from "@/lib/clients/client-documents.functions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, FileText, ExternalLink, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const MAX_BYTES = 20 * 1024 * 1024;

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function ClientDocumentsTab({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listClientDocuments);
  const uploadFn = useServerFn(uploadClientDocument);
  const deleteFn = useServerFn(deleteClientDocument);
  const [confirmDel, setConfirmDel] = useState<ClientDocument | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["client-documents", clientId],
    queryFn: () => listFn({ data: { clientId } }),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error("Arquivo maior que 20 MB");
      const fd = new FormData();
      fd.append("clientId", clientId);
      fd.append("file", file);
      return uploadFn({ data: fd });
    },
    onSuccess: () => {
      toast.success("Documento enviado ao Google Drive");
      qc.invalidateQueries({ queryKey: ["client-documents", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Documento removido");
      qc.invalidateQueries({ queryKey: ["client-documents", clientId] });
      setConfirmDel(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onDrop = useCallback(
    (files: File[]) => {
      files.forEach((f) => upload.mutate(f));
    },
    [upload],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxSize: MAX_BYTES,
  });

  const docs = data?.documents ?? [];

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">
          {isDragActive ? "Solte para enviar" : "Arraste arquivos ou clique para selecionar"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, DOC, imagens. Até 20 MB. Salvo no Google Drive.
        </p>
      </div>

      {upload.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhum documento anexado ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50"
            >
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(d.size_bytes)} ·{" "}
                  {format(new Date(d.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>
              <Button size="sm" variant="ghost" asChild>
                <a href={d.view_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDel(d)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover documento?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo será removido do Google Drive e do sistema. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDel && remove.mutate(confirmDel.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
