import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createWebhook, deleteWebhook, listWebhooks, toggleWebhook,
} from "@/lib/pipeline/pipeline.functions";
import type { PipelineStage } from "./types";

export function WebhooksDialog({
  open,
  onOpenChange,
  stages,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stages: PipelineStage[];
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWebhooks);
  const createFn = useServerFn(createWebhook);
  const toggleFn = useServerFn(toggleWebhook);
  const delFn = useServerFn(deleteWebhook);

  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [targetUrl, setTargetUrl] = useState("");
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? "");

  const { data: hooks } = useQuery({
    queryKey: ["lead-webhooks"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name: name.trim(),
          direction,
          target_url: direction === "outbound" ? targetUrl.trim() : null,
          default_stage_id: direction === "inbound" ? stageId || null : null,
        },
      }),
    onSuccess: () => {
      setName(""); setTargetUrl("");
      qc.invalidateQueries({ queryKey: ["lead-webhooks"] });
      toast.success("Webhook criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Webhooks · integração com Make</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meta Lead Ads" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "inbound" | "outbound")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">Entrada (recebe leads)</SelectItem>
                  <SelectItem value="outbound">Saída (envia eventos)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {direction === "inbound" ? (
              <div className="sm:col-span-2">
                <Label>Etapa de destino</Label>
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="sm:col-span-2">
                <Label>URL de destino (Make)</Label>
                <Input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://hook.make.com/..." />
              </div>
            )}
          </div>
          <Button
            className="mt-3"
            size="sm"
            disabled={!name.trim() || create.isPending || (direction === "outbound" && !targetUrl.trim())}
            onClick={() => create.mutate()}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Criar webhook
          </Button>
        </div>

        <div className="space-y-3">
          {(hooks ?? []).map((h) => {
            const url =
              h.direction === "inbound" ? `${origin}/api/public/leads/${h.token}` : h.target_url ?? "";
            return (
              <div key={h.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{h.name}</p>
                    <Badge variant={h.direction === "inbound" ? "secondary" : "outline"}>
                      {h.direction === "inbound" ? "Entrada" : "Saída"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={h.active}
                      onCheckedChange={(v) =>
                        toggleFn({ data: { id: h.id, active: v } }).then(() =>
                          qc.invalidateQueries({ queryKey: ["lead-webhooks"] }),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() =>
                        delFn({ data: { id: h.id } }).then(() =>
                          qc.invalidateQueries({ queryKey: ["lead-webhooks"] }),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{url}</code>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      navigator.clipboard.writeText(url);
                      toast.success("URL copiada");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {h.direction === "inbound"
                    ? "POST JSON: { name, email, phone, company, value, utm_source, utm_medium, utm_campaign, utm_term, utm_content, source, landing_url }"
                    : "Recebe eventos de criação e mudança de etapa dos leads."}
                  {" · "}
                  {h.call_count} chamadas
                </p>
              </div>
            );
          })}
          {(hooks ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum webhook configurado.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
