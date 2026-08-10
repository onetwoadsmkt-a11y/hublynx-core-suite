import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createWebhook, deleteWebhook, listWebhooks, toggleWebhook, updateWebhook,
} from "@/lib/pipeline/pipeline.functions";
import type { PipelineStage } from "./types";

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{value}</code>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("URL copiada");
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

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

  const [tab, setTab] = useState<"inbound" | "outbound">("inbound");
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? "");

  const { data: hooks } = useQuery({
    queryKey: ["lead-webhooks"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (direction: "inbound" | "outbound") =>
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
  const list = (hooks ?? []).filter((h) => h.direction === tab);

  const isValidMakeUrl = /^https?:\/\/.+/i.test(targetUrl.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Webhooks · integração com Make</DialogTitle>
          <DialogDescription>
            Receba leads de formulários e envie eventos do pipeline para automações.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "inbound" | "outbound")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="inbound">Receber leads</TabsTrigger>
            <TabsTrigger value="outbound">Enviar eventos</TabsTrigger>
          </TabsList>

          {/* ---------- INBOUND ---------- */}
          <TabsContent value="inbound" className="space-y-4 pt-4">
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="mb-3 text-xs text-muted-foreground">
                Crie um endpoint, copie a URL gerada e cole no módulo <strong>HTTP → Make a request</strong> (método POST,
                body JSON) do seu cenário no Make. Cada envio cria um lead na etapa escolhida.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Formulário do site" />
                </div>
                <div>
                  <Label>Etapa de destino</Label>
                  <Select value={stageId} onValueChange={setStageId}>
                    <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="mt-3"
                size="sm"
                disabled={!name.trim() || create.isPending}
                onClick={() => create.mutate("inbound")}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Gerar URL de recebimento
              </Button>
            </div>
          </TabsContent>

          {/* ---------- OUTBOUND ---------- */}
          <TabsContent value="outbound" className="space-y-4 pt-4">
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="mb-3 text-xs text-muted-foreground">
                No Make, crie um cenário com o módulo <strong>Webhooks → Custom webhook</strong>, copie a URL
                (<code>https://hook.*.make.com/...</code>) e cole abaixo para receber eventos de criação e mudança de etapa.
              </p>
              <div className="grid gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cenário Make - Leads" />
                </div>
                <div>
                  <Label>Cole aqui a URL do webhook do Make</Label>
                  <Input
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://hook.us1.make.com/abc123..."
                  />
                  {targetUrl.trim() && !isValidMakeUrl && (
                    <p className="mt-1 text-[11px] text-destructive">Informe uma URL válida começando com https://</p>
                  )}
                </div>
              </div>
              <Button
                className="mt-3"
                size="sm"
                disabled={!name.trim() || !isValidMakeUrl || create.isPending}
                onClick={() => create.mutate("outbound")}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Salvar webhook do Make
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-3">
          {list.map((h) => {
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
                <div className="mt-2">
                  <CopyField value={url} />
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
          {list.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {tab === "inbound"
                ? "Nenhum endpoint de recebimento criado."
                : "Nenhum webhook do Make salvo."}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
