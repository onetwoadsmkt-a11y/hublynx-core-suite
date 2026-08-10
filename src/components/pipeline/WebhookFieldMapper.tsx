import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  flattenPayload, buildLeadFromPayload, LEAD_FIELDS, type FieldMap,
} from "@/lib/pipeline/lead-mapping";
import { reprocessLastPayload, updateWebhookMapping } from "@/lib/pipeline/pipeline.functions";

const AUTO = "__auto__";

export function WebhookFieldMapper({
  webhookId,
  fieldMap,
  lastPayload,
  lastPayloadAt,
}: {
  webhookId: string;
  fieldMap: FieldMap;
  lastPayload: unknown;
  lastPayloadAt: string | null;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(updateWebhookMapping);
  const reprocessFn = useServerFn(reprocessLastPayload);
  const [map, setMap] = useState<FieldMap>(fieldMap ?? {});

  const flat = useMemo(() => flattenPayload(lastPayload), [lastPayload]);
  const paths = useMemo(() => Object.keys(flat), [flat]);
  const preview = useMemo(
    () => (lastPayload ? buildLeadFromPayload(lastPayload, map) : {}),
    [lastPayload, map],
  );

  const save = useMutation({
    mutationFn: () => saveFn({ data: { id: webhookId, field_map: map as never } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-webhooks"] });
      toast.success("Mapeamento salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createLead = useMutation({
    mutationFn: () => reprocessFn({ data: { id: webhookId, create: true } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      toast.success("Lead recriado a partir do último envio");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!lastPayload) {
    return (
      <p className="mt-2 rounded-lg border border-dashed p-3 text-[11px] text-muted-foreground">
        Nenhum envio recebido ainda. Dispare um teste do formulário/Make e reabra esta janela para
        mapear os campos automaticamente.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Mapeamento dos campos do formulário</p>
        {lastPayloadAt && (
          <span className="text-[10px] text-muted-foreground">
            último envio: {new Date(lastPayloadAt).toLocaleString("pt-BR")}
          </span>
        )}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {LEAD_FIELDS.map((f) => {
          const current = map[f.key];
          const value = typeof current === "string" ? current : AUTO;
          const detected = preview[f.key];
          return (
            <div key={f.key} className="min-w-0">
              <Label className="text-[11px]">{f.label}</Label>
              <Select
                value={value}
                onValueChange={(v) =>
                  setMap((m) => ({ ...m, [f.key]: v === AUTO ? null : v }))
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Automático" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={AUTO}>Automático</SelectItem>
                  {paths.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">
                      {p} — {flat[p]?.slice(0, 30)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {detected ? `→ ${detected}` : "sem valor detectado"}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Salvar mapeamento
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={createLead.isPending}
          onClick={() => createLead.mutate()}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Recriar lead do último envio
        </Button>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-muted-foreground">
          Ver payload recebido
        </summary>
        <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px]">
          {JSON.stringify(lastPayload, null, 2)}
        </pre>
      </details>
    </div>
  );
}
