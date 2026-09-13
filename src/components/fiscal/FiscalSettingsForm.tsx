import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getFiscalSettings, saveFiscalSettings } from "@/lib/fiscal/fiscal.functions";
import type { FiscalEnvironment, FiscalSettings } from "@/lib/fiscal/types";

const EMPTY: FiscalSettings = {
  id: null,
  ambiente: "homologacao",
  inscricao_municipal: null,
  codigo_municipio: null,
  regime_tributario: null,
  optante_simples: false,
  incentivo_fiscal: false,
  serie_dps: null,
  proximo_numero_dps: 1,
  certificado_ref: null,
  certificado_validade: null,
  email_envio: null,
  observacoes_padrao: null,
  ativo: false,
};

export function FiscalSettingsForm() {
  const qc = useQueryClient();
  const loadFn = useServerFn(getFiscalSettings);
  const saveFn = useServerFn(saveFiscalSettings);

  const { data, isLoading } = useQuery({
    queryKey: ["fiscal", "settings"],
    queryFn: () => loadFn(),
  });

  const [form, setForm] = useState<FiscalSettings>(EMPTY);
  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data?.settings]);

  const canEdit = data?.canEdit ?? false;

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          ambiente: form.ambiente,
          inscricao_municipal: form.inscricao_municipal,
          codigo_municipio: form.codigo_municipio,
          regime_tributario: form.regime_tributario,
          optante_simples: form.optante_simples,
          incentivo_fiscal: form.incentivo_fiscal,
          serie_dps: form.serie_dps,
          proximo_numero_dps: Number(form.proximo_numero_dps) || 1,
          certificado_ref: form.certificado_ref,
          certificado_validade: form.certificado_validade,
          email_envio: form.email_envio,
          observacoes_padrao: form.observacoes_padrao,
          ativo: form.ativo,
        },
      }),
    onSuccess: () => {
      toast.success("Configuração fiscal salva");
      qc.invalidateQueries({ queryKey: ["fiscal"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof FiscalSettings>(k: K, v: FiscalSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Carregando configuração…</Card>;
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Configuração fiscal da empresa</h3>
          <p className="text-sm text-muted-foreground">
            Dados usados na geração da DPS. Enquanto o ambiente for homologação, nada é enviado
            para a prefeitura.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="fiscal-ativo"
            checked={form.ativo}
            disabled={!canEdit}
            onCheckedChange={(v) => set("ativo", v)}
          />
          <Label htmlFor="fiscal-ativo" className="text-sm">
            Emissão ativa
          </Label>
        </div>
      </div>

      {!canEdit && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Somente administradores da empresa podem alterar estes dados.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Ambiente">
          <Select
            value={form.ambiente}
            disabled={!canEdit}
            onValueChange={(v) => set("ambiente", v as FiscalEnvironment)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="homologacao">Homologação</SelectItem>
              <SelectItem value="producao">Produção</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Inscrição municipal">
          <Input
            value={form.inscricao_municipal ?? ""}
            disabled={!canEdit}
            onChange={(e) => set("inscricao_municipal", e.target.value)}
          />
        </Field>

        <Field label="Código do município (IBGE)">
          <Input
            value={form.codigo_municipio ?? ""}
            disabled={!canEdit}
            onChange={(e) => set("codigo_municipio", e.target.value)}
          />
        </Field>

        <Field label="Regime tributário">
          <Input
            placeholder="Simples Nacional, Lucro Presumido…"
            value={form.regime_tributario ?? ""}
            disabled={!canEdit}
            onChange={(e) => set("regime_tributario", e.target.value)}
          />
        </Field>

        <Field label="Série da DPS">
          <Input
            value={form.serie_dps ?? ""}
            disabled={!canEdit}
            onChange={(e) => set("serie_dps", e.target.value)}
          />
        </Field>

        <Field label="Próximo número da DPS">
          <Input
            type="number"
            min={1}
            value={form.proximo_numero_dps}
            disabled={!canEdit}
            onChange={(e) => set("proximo_numero_dps", Number(e.target.value) || 1)}
          />
        </Field>

        <Field label="E-mail de envio">
          <Input
            type="email"
            value={form.email_envio ?? ""}
            disabled={!canEdit}
            onChange={(e) => set("email_envio", e.target.value)}
          />
        </Field>

        <Field label="Referência do certificado">
          <Input
            placeholder="Identificação do certificado digital"
            value={form.certificado_ref ?? ""}
            disabled={!canEdit}
            onChange={(e) => set("certificado_ref", e.target.value)}
          />
        </Field>

        <Field label="Validade do certificado">
          <Input
            type="date"
            value={form.certificado_validade ?? ""}
            disabled={!canEdit}
            onChange={(e) => set("certificado_validade", e.target.value)}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={form.optante_simples}
            disabled={!canEdit}
            onCheckedChange={(v) => set("optante_simples", v)}
          />
          Optante pelo Simples Nacional
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={form.incentivo_fiscal}
            disabled={!canEdit}
            onCheckedChange={(v) => set("incentivo_fiscal", v)}
          />
          Possui incentivo fiscal
        </label>
      </div>

      <Field label="Observações padrão da nota">
        <Textarea
          rows={3}
          value={form.observacoes_padrao ?? ""}
          disabled={!canEdit}
          onChange={(e) => set("observacoes_padrao", e.target.value)}
        />
      </Field>

      <div className="flex justify-end">
        <Button disabled={!canEdit || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : "Salvar configuração"}
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
