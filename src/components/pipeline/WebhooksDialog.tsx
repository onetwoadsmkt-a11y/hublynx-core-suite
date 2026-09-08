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
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  createWebhook, deleteWebhook, listAllStages, listWebhooks, toggleWebhook, updateWebhook,
} from "@/lib/pipeline/pipeline.functions";
import { WebhookFieldMapper } from "./WebhookFieldMapper";
import { WebhookPayloadTemplate } from "./WebhookPayloadTemplate";
import type { PipelineStage } from "./types";

/** URL pública acessível por serviços externos (o preview do editor bloqueia POSTs externos). */
const PRODUCTION_BASE = "https://core.hublynx.com.br";

function publicBaseUrl() {
  if (typeof window === "undefined") return PRODUCTION_BASE;
  const host = window.location.hostname;
  const isPreview = host.includes("id-preview--") || host === "localhost";
  return isPreview ? PRODUCTION_BASE : window.location.origin;
}

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
  const updateFn = useServerFn(updateWebhook);
  const allStagesFn = useServerFn(listAllStages);

  const { data: allStages } = useQuery({
    queryKey: ["pipeline-all-stages"],
    queryFn: () => allStagesFn(),
    enabled: open,
  });

  const stageOptions = (allStages ?? []).length
    ? (allStages ?? [])
    : stages.map((s) => ({ id: s.id, name: s.name, pipeline_id: null as string | null, pipeline_name: "Pipeline" }));

  const stageGroups = Array.from(
    stageOptions.reduce((m, s) => {
      const k = s.pipeline_name;
      m.set(k, [...(m.get(k) ?? []), s]);
      return m;
    }, new Map<string, typeof stageOptions>()),
  );

  const [tab, setTab] = useState<"inbound" | "outbound">("inbound");
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [stageId, setStageId] = useState<string>("");
  const [source, setSource] = useState("");

  const { data: hooks } = useQuery({
    queryKey: ["lead-webhooks"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const patch = useMutation({
    mutationFn: (v: { id: string; default_stage_id?: string | null; default_source?: string | null }) =>
      updateFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-webhooks"] });
      toast.success("Webhook atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: (direction: "inbound" | "outbound") =>
      createFn({
        data: {
          name: name.trim(),
          direction,
          target_url: direction === "outbound" ? targetUrl.trim() : null,
          default_stage_id: direction === "inbound" ? stageId || null : null,
          default_source: direction === "inbound" ? source.trim() || null : null,
        },
      }),
    onSuccess: () => {
      setName(""); setTargetUrl(""); setSource("");
      qc.invalidateQueries({ queryKey: ["lead-webhooks"] });
      toast.success("Webhook criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const origin = publicBaseUrl();
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
                      {stageGroups.map(([pipe, items]) => (
                        <SelectGroup key={pipe}>
                          <SelectLabel>{pipe}</SelectLabel>
                          {items.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Fonte do lead (origem)</Label>
                  <Input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="Site, Meta Ads, Google Ads, Indicação..."
                    list="lead-source-suggestions"
                  />
                  <datalist id="lead-source-suggestions">
                    {["Site", "Meta Ads", "Google Ads", "Instagram", "WhatsApp", "Indicação", "Landing Page"].map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Aplicada quando o envio não trouxer o campo <code>source</code>.
                  </p>
                </div>
              </div>
              <Button
                className="mt-3"
                size="sm"
                disabled={!name.trim() || !stageId || create.isPending}
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
                  {h.direction === "inbound" && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      No Make use <strong>HTTP → Make a request</strong>: método <strong>POST</strong>, Body type{" "}
                      <strong>Raw</strong>, Content type <strong>JSON</strong>. Esta é a URL pública de produção —
                      funciona mesmo com o editor aberto no preview.
                    </p>
                  )}
                </div>
                {h.direction === "inbound" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-[11px]">Etapa de destino</Label>
                      <Select
                        value={h.default_stage_id ?? ""}
                        onValueChange={(v) => patch.mutate({ id: h.id, default_stage_id: v })}
                      >
                        <SelectTrigger className="h-8"><SelectValue placeholder="Escolha a etapa" /></SelectTrigger>
                        <SelectContent>
                          {stageGroups.map(([pipe, items]) => (
                            <SelectGroup key={pipe}>
                              <SelectLabel>{pipe}</SelectLabel>
                              {items.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      {!h.default_stage_id && (
                        <p className="mt-1 text-[11px] text-destructive">
                          Sem etapa definida — os leads caem na primeira etapa do primeiro pipeline.
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-[11px]">Fonte do lead</Label>
                      <Input
                        className="h-8"
                        defaultValue={h.default_source ?? ""}
                        list="lead-source-suggestions"
                        placeholder="Site, Meta Ads..."
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (h.default_source ?? "")) patch.mutate({ id: h.id, default_source: v || null });
                        }}
                      />
                    </div>
                  </div>
                )}
                {h.direction === "inbound" && <WebhookPayloadTemplate />}
                {h.direction === "inbound" && (
                  <WebhookFieldMapper
                    webhookId={h.id}
                    fieldMap={(h.field_map ?? {}) as never}
                    lastPayload={h.last_payload ?? null}
                    lastPayloadAt={h.last_payload_at ?? null}
                  />
                )}

                <p className="mt-1 text-[11px] text-muted-foreground">
                  {h.direction === "inbound"
                    ? "POST JSON: { name, email, phone, company, value, utm_source, utm_medium, utm_campaign, utm_term, utm_content, source, landing_url }"
                    : "Recebe eventos de criação e mudança de etapa dos leads."}
                  {" · "}
                  {h.call_count} chamadas
                  {h.last_called_at
                    ? ` · último: ${new Date(h.last_called_at).toLocaleString("pt-BR")}`
                    : " · nenhuma recebida ainda"}
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
