import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CloudOff, ExternalLink, FileText, History, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { JourneyTimeline } from "@/components/projects/JourneyTimeline";
import { fmtSize } from "@/components/projects/TaskAttachments";
import {
  addProjectMessage,
  attachmentDownloadUrl,
  getProjectJourney,
  listProjectAttachments,
  retryAttachmentDrive,
} from "@/lib/projects/attachments.functions";

/** Histórico da jornada + mensagens com o cliente (aba do projeto no Core). */
export function ProjectJourneyPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getProjectJourney);
  const sendFn = useServerFn(addProjectMessage);
  const q = useQuery({
    queryKey: ["project-journey", projectId],
    queryFn: () => getFn({ data: { projectId } }),
    refetchInterval: 60_000,
  });
  const send = useMutation({
    mutationFn: (body: string) => sendFn({ data: { projectId, body } }),
    onSuccess: () => {
      toast.success("Mensagem registrada. O cliente vê no portal.");
      qc.invalidateQueries({ queryKey: ["project-journey", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="mt-4 rounded-2xl p-3 sm:mt-5 sm:p-5">
      <h3 className="mb-1 flex items-center gap-2 font-semibold">
        <History className="h-4 w-4" /> Histórico e mensagens
      </h3>
      <p className="mb-4 hidden text-xs text-muted-foreground sm:block">
        Registro da jornada: tarefas concluídas, comentários, arquivos, etapas e mensagens — com
        quem fez e quando. O cliente vê no portal só o que é dele ou visível para ele.
      </p>
      {q.isError ? (
        <p className="text-sm text-rose-600">
          Não foi possível carregar o histórico. {(q.error as Error).message}
        </p>
      ) : (
        <JourneyTimeline
          audience="equipe"
          events={q.data ?? []}
          loading={q.isLoading}
          onSend={(body) => send.mutateAsync(body)}
          sending={send.isPending}
          placeholder="Mensagem para o cliente (aparece no portal)…"
        />
      )}
    </Card>
  );
}

/** Todos os documentos anexados nas tarefas, com a situação da cópia no Drive. */
export function ProjectAttachmentsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectAttachments);
  const urlFn = useServerFn(attachmentDownloadUrl);
  const retryFn = useServerFn(retryAttachmentDrive);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["project-attachments", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const list = [...(q.data ?? [])].reverse();
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold">Documentos das tarefas</h3>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum documento anexado ainda. Anexe pelas tarefas na aba Etapas (o cliente anexa pelo
          portal).
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {list.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                onClick={() =>
                  run(a.id, async () => {
                    window.location.href = (await urlFn({ data: { id: a.id } })).url;
                  })
                }
              >
                {a.name}
              </button>
              {a.drive_status === "ok" && a.drive_url ? (
                <a
                  href={a.drive_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                >
                  No Drive <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <button
                  type="button"
                  title={a.drive_error ?? undefined}
                  onClick={() =>
                    run(`d-${a.id}`, async () => {
                      const r = await retryFn({ data: { id: a.id } });
                      if (r.status !== "ok") throw new Error(r.error ?? "Falha no Drive");
                      toast.success("Copiado para o Google Drive.");
                      qc.invalidateQueries({ queryKey: ["project-attachments", projectId] });
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                >
                  {busy === `d-${a.id}` ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CloudOff className="h-3 w-3" />
                  )}
                  {a.drive_status === "sem_drive" ? "Drive não conectado" : "Reenviar ao Drive"}
                  <RefreshCw className="h-3 w-3" />
                </button>
              )}
              <p className="w-full pl-7 text-xs text-muted-foreground">
                {a.task_title ? `${a.task_title} · ` : ""}
                {a.author}
                {a.uploader_kind === "cliente" ? " (cliente)" : ""} ·{" "}
                {new Date(a.uploaded_at).toLocaleString("pt-BR")} · {fmtSize(a.size)}
                {a.note ? ` · ${a.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
