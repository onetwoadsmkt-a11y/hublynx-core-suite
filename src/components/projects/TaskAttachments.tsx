import { useRef, useState } from "react";
import {
  CloudOff,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCEPT_ATTACHMENTS, MAX_ATTACHMENT_MB } from "@/lib/projects/attachments.functions";
import { cn } from "@/lib/utils";

export type AttachmentView = {
  id: string;
  name: string;
  size: number;
  mime: string | null;
  note?: string | null;
  author: string;
  created_at: string;
  mine: boolean;
  drive_status?: "pendente" | "ok" | "erro" | "sem_drive";
  drive_url?: string | null;
  drive_error?: string | null;
};

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function FileIcon({ mime, className }: { mime: string | null; className?: string }) {
  if (mime?.startsWith("image/")) return <ImageIcon className={className} />;
  if (mime?.includes("sheet") || mime?.includes("excel") || mime === "text/csv")
    return <FileSpreadsheet className={className} />;
  return <FileText className={className} />;
}

/** Lista de arquivos de uma tarefa + botão de anexar (portal e Core). */
export function TaskAttachments({
  items,
  canUpload,
  onUpload,
  onOpen,
  onRemove,
  canRemove,
  onRetryDrive,
  showDrive = false,
  hint,
}: {
  items: AttachmentView[];
  canUpload: boolean;
  onUpload: (file: File, note: string) => Promise<unknown>;
  onOpen: (id: string) => Promise<string>;
  onRemove?: (a: AttachmentView) => Promise<unknown>;
  canRemove?: (a: AttachmentView) => boolean;
  onRetryDrive?: (id: string) => Promise<unknown>;
  showDrive?: boolean;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      toast.error(`O arquivo deve ter no máximo ${MAX_ATTACHMENT_MB} MB.`);
      return;
    }
    setFile(f);
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!file) return;
    await run("upload", async () => {
      await onUpload(file, note);
      setFile(null);
      setNote("");
      if (input.current) input.current.value = "";
    });
  }

  async function open(a: AttachmentView) {
    // link temporário com "baixar": o navegador salva o arquivo sem sair da página
    await run(`open-${a.id}`, async () => {
      window.location.href = await onOpen(a.id);
    });
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-background px-2.5 py-2"
            >
              <FileIcon mime={a.mime} className="h-4 w-4 shrink-0 text-muted-foreground" />
              <button
                type="button"
                onClick={() => open(a)}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                title="Abrir / baixar"
              >
                {a.name}
              </button>
              {busy === `open-${a.id}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {showDrive && a.drive_status === "ok" && a.drive_url && (
                <a
                  href={a.drive_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                >
                  No Drive <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {showDrive &&
                (a.drive_status === "erro" ||
                  a.drive_status === "sem_drive" ||
                  a.drive_status === "pendente") && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                    title={a.drive_error ?? undefined}
                  >
                    <CloudOff className="h-3 w-3" />
                    {a.drive_status === "sem_drive"
                      ? "Drive não conectado"
                      : a.drive_status === "pendente"
                        ? "Enviando ao Drive"
                        : "Falhou no Drive"}
                    {onRetryDrive && a.drive_status !== "pendente" && (
                      <button
                        type="button"
                        className="ml-0.5 underline"
                        onClick={() => run(`drive-${a.id}`, () => onRetryDrive(a.id))}
                        disabled={busy === `drive-${a.id}`}
                      >
                        {busy === `drive-${a.id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        <span className="sr-only">Reenviar ao Drive</span>
                      </button>
                    )}
                  </span>
                )}
              {onRemove && (canRemove ? canRemove(a) : a.mine) && (
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-rose-600"
                  aria-label={`Remover ${a.name}`}
                  disabled={busy === `rm-${a.id}`}
                  onClick={() => {
                    if (
                      window.confirm(`Remover "${a.name}" da tarefa? Fica registrado no histórico.`)
                    )
                      run(`rm-${a.id}`, () => onRemove(a));
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <p className="w-full pl-6 text-[11px] text-muted-foreground">
                {a.mine ? "Você" : a.author} ·{" "}
                {new Date(a.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {fmtSize(a.size)}
                {a.note ? ` · ${a.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canUpload &&
        (file ? (
          <div className="space-y-2 rounded-lg border border-dashed p-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
              <span className="text-xs text-muted-foreground">{fmtSize(file.size)}</span>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"
                aria-label="Cancelar"
                onClick={() => setFile(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Observação (opcional), ex.: contrato assinado"
                maxLength={500}
                className="h-10 text-sm"
              />
              <Button
                type="button"
                onClick={send}
                disabled={busy === "upload"}
                className="h-10 shrink-0"
              >
                {busy === "upload" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Enviar arquivo
              </Button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0]);
            }}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("h-9 gap-1.5")}
              onClick={() => input.current?.click()}
            >
              <Paperclip className="h-3.5 w-3.5" /> Anexar arquivo
            </Button>
            {hint && <span className="ml-2 text-[11px] text-muted-foreground">{hint}</span>}
          </div>
        ))}
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTACHMENTS}
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  );
}
