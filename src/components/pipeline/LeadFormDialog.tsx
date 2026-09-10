import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { upsertLead } from "@/lib/pipeline/pipeline.functions";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { PipelineTag } from "@/lib/pipeline/tags";
import { cn } from "@/lib/utils";
import type { Lead, PipelineStage } from "./types";

type Form = {
  name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  source: string;
  value: string;
  stage_id: string;
  temperature: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  next_action: string;
  next_action_at: string;
};

const EMPTY: Form = {
  name: "", company: "", email: "", phone: "", city: "", state: "", source: "", value: "",
  stage_id: "", temperature: "morno", utm_source: "", utm_medium: "", utm_campaign: "", utm_term: "", utm_content: "",
  next_action: "", next_action_at: "",
};

export function LeadFormDialog({
  open,
  onOpenChange,
  stages,
  lead,
  defaultStageId,
  tags = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stages: PipelineStage[];
  lead?: Lead | null;
  defaultStageId?: string;
  tags?: PipelineTag[];
}) {
  const qc = useQueryClient();
  const save = useServerFn(upsertLead);
  const { activeOrganizationId } = useWorkspace();
  const [form, setForm] = useState<Form>(EMPTY);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(
      lead
        ? {
            name: lead.name ?? "",
            company: lead.company ?? "",
            email: lead.email ?? "",
            phone: lead.phone ?? "",
            city: lead.city ?? "",
            state: lead.state ?? "",
            source: lead.source ?? "",
            value: lead.value != null ? String(lead.value) : "",
            stage_id: lead.stage_id ?? defaultStageId ?? stages[0]?.id ?? "",
            temperature: lead.temperature ?? "morno",
            utm_source: lead.utm_source ?? "",
            utm_medium: lead.utm_medium ?? "",
            utm_campaign: lead.utm_campaign ?? "",
            utm_term: lead.utm_term ?? "",
            utm_content: lead.utm_content ?? "",
            next_action: (lead as any).next_action ?? "",
            next_action_at: (lead as any).next_action_at
              ? String((lead as any).next_action_at).slice(0, 10)
              : "",
          }
        : { ...EMPTY, stage_id: defaultStageId ?? stages[0]?.id ?? "" },
    );
    setSelectedTags((((lead as any)?.tags as string[] | null) ?? []).map(String));
  }, [open, lead, defaultStageId, stages]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...(lead ? { id: lead.id } : activeOrganizationId ? { organizationId: activeOrganizationId } : {}),
          name: form.name.trim(),
          company: form.company || null,
          email: form.email || null,
          phone: form.phone || null,
          city: form.city || null,
          state: form.state || null,
          source: form.source || null,
          value: form.value ? Number(form.value.replace(",", ".")) : null,
          stage_id: form.stage_id || null,
          temperature: (form.temperature as "quente" | "morno" | "frio") || "morno",
          utm_source: form.utm_source || null,
          utm_medium: form.utm_medium || null,
          utm_campaign: form.utm_campaign || null,
          utm_term: form.utm_term || null,
          utm_content: form.utm_content || null,
          tags: selectedTags,
          next_action: form.next_action || null,
          next_action_at: form.next_action_at
            ? new Date(`${form.next_action_at}T12:00:00`).toISOString()
            : null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      toast.success(lead ? "Lead atualizado" : "Lead criado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lead ? "Editar lead" : "Novo lead"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={set("name")} placeholder="Nome do lead" />
          </div>
          <div>
            <Label>Empresa</Label>
            <Input value={form.company} onChange={set("company")} />
          </div>
          <div>
            <Label>Etapa</Label>
            <Select value={form.stage_id} onValueChange={(v) => setForm((f) => ({ ...f, stage_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Temperatura</Label>
            <Select value={form.temperature} onValueChange={(v) => setForm((f) => ({ ...f, temperature: v }))}>
              <SelectTrigger><SelectValue placeholder="Temperatura" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="quente">Quente</SelectItem>
                <SelectItem value="morno">Morno</SelectItem>
                <SelectItem value="frio">Frio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={set("phone")} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input value={form.email} onChange={set("email")} />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={form.city} onChange={set("city")} />
          </div>
          <div>
            <Label>Estado</Label>
            <Input value={form.state} onChange={set("state")} />
          </div>
          <div>
            <Label>Origem</Label>
            <Input value={form.source} onChange={set("source")} placeholder="Site, Meta Ads..." />
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input value={form.value} onChange={set("value")} inputMode="decimal" />
          </div>

          {tags.length > 0 && (
            <div className="sm:col-span-2 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tags de conversão
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const on = selectedTags.some((s) => s.toLowerCase() === t.slug.toLowerCase());
                  return (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() =>
                        setSelectedTags((prev) =>
                          on
                            ? prev.filter((s) => s.toLowerCase() !== t.slug.toLowerCase())
                            : [...prev, t.slug],
                        )
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition",
                        on ? "border-transparent font-medium text-white" : "text-muted-foreground hover:bg-muted",
                      )}
                      style={on ? { backgroundColor: t.color } : undefined}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="sm:col-span-2 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Próxima ação
            </p>
          </div>
          <div>
            <Label>Próxima ação</Label>
            <Input
              value={form.next_action}
              onChange={set("next_action")}
              placeholder="Ligar, enviar proposta..."
            />
          </div>
          <div>
            <Label>Data da próxima ação</Label>
            <Input type="date" value={form.next_action_at} onChange={set("next_action_at")} />
          </div>

          <div className="sm:col-span-2 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rastreamento de campanha (UTM)
            </p>
          </div>
          <div>
            <Label>utm_source</Label>
            <Input value={form.utm_source} onChange={set("utm_source")} />
          </div>
          <div>
            <Label>utm_medium</Label>
            <Input value={form.utm_medium} onChange={set("utm_medium")} />
          </div>
          <div>
            <Label>utm_campaign</Label>
            <Input value={form.utm_campaign} onChange={set("utm_campaign")} />
          </div>
          <div>
            <Label>utm_content</Label>
            <Input value={form.utm_content} onChange={set("utm_content")} />
          </div>
          <div className="sm:col-span-2">
            <Label>utm_term</Label>
            <Input value={form.utm_term} onChange={set("utm_term")} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!form.name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
