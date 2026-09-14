import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listFiscalServiceCodes,
  setFiscalServiceCodeActive,
  upsertFiscalServiceCode,
} from "@/lib/fiscal/fiscal.functions";
import { listServicos } from "@/lib/finance/servicos.functions";
import type { FiscalServiceCode } from "@/lib/fiscal/types";

const NONE = "__none__";

type FormState = {
  id?: string;
  descricao: string;
  servico_id: string;
  codigo_tributacao_nacional: string;
  codigo_tributacao_municipal: string;
  cnae: string;
  aliquota_iss: string;
  iss_retido: boolean;
  retencao_ir: string;
  retencao_pis: string;
  retencao_cofins: string;
  retencao_csll: string;
  retencao_inss: string;
  tributacao_municipio: string;
  ativo: boolean;
};

const EMPTY_FORM: FormState = {
  descricao: "",
  servico_id: NONE,
  codigo_tributacao_nacional: "",
  codigo_tributacao_municipal: "",
  cnae: "",
  aliquota_iss: "",
  iss_retido: false,
  retencao_ir: "",
  retencao_pis: "",
  retencao_cofins: "",
  retencao_csll: "",
  retencao_inss: "",
  tributacao_municipio: "",
  ativo: true,
};

const toNum = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const pct = (v: number | null) => (v === null ? "—" : `${v.toString().replace(".", ",")}%`);

function toForm(c: FiscalServiceCode): FormState {
  const s = (v: number | null) => (v === null ? "" : String(v));
  return {
    id: c.id,
    descricao: c.descricao,
    servico_id: c.servico_id ?? NONE,
    codigo_tributacao_nacional: c.codigo_tributacao_nacional ?? "",
    codigo_tributacao_municipal: c.codigo_tributacao_municipal ?? "",
    cnae: c.cnae ?? "",
    aliquota_iss: s(c.aliquota_iss),
    iss_retido: c.iss_retido,
    retencao_ir: s(c.retencao_ir),
    retencao_pis: s(c.retencao_pis),
    retencao_cofins: s(c.retencao_cofins),
    retencao_csll: s(c.retencao_csll),
    retencao_inss: s(c.retencao_inss),
    tributacao_municipio: c.tributacao_municipio ?? "",
    ativo: c.ativo,
  };
}

export function FiscalServiceCodes() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFiscalServiceCodes);
  const saveFn = useServerFn(upsertFiscalServiceCode);
  const toggleFn = useServerFn(setFiscalServiceCodeActive);
  const servicosFn = useServerFn(listServicos);

  const { data } = useQuery({ queryKey: ["fiscal", "service-codes"], queryFn: () => listFn() });
  const { data: servicos } = useQuery({ queryKey: ["finance", "servicos"], queryFn: () => servicosFn() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const canEdit = data?.canEdit ?? false;
  const codes = data?.codes ?? [];

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          ...(form.id ? { id: form.id } : {}),
          descricao: form.descricao,
          servico_id: form.servico_id === NONE ? null : form.servico_id,
          codigo_tributacao_nacional: form.codigo_tributacao_nacional,
          codigo_tributacao_municipal: form.codigo_tributacao_municipal,
          cnae: form.cnae,
          aliquota_iss: toNum(form.aliquota_iss),
          iss_retido: form.iss_retido,
          retencao_ir: toNum(form.retencao_ir),
          retencao_pis: toNum(form.retencao_pis),
          retencao_cofins: toNum(form.retencao_cofins),
          retencao_csll: toNum(form.retencao_csll),
          retencao_inss: toNum(form.retencao_inss),
          tributacao_municipio: form.tributacao_municipio,
          ativo: form.ativo,
        },
      }),
    onSuccess: () => {
      toast.success("Serviço fiscal salvo");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["fiscal"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscal"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h3 className="text-base font-semibold">Serviços fiscais</h3>
          <p className="text-sm text-muted-foreground">
            Códigos de tributação e retenções aplicados na emissão.
          </p>
        </div>
        <Button
          disabled={!canEdit}
          onClick={() => {
            setForm(EMPTY_FORM);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Novo serviço
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descrição</TableHead>
            <TableHead>Linha de serviço</TableHead>
            <TableHead>Trib. nacional</TableHead>
            <TableHead>Trib. municipal</TableHead>
            <TableHead>CNAE</TableHead>
            <TableHead className="text-right">ISS</TableHead>
            <TableHead>Retido</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {codes.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                Nenhum serviço fiscal cadastrado.
              </TableCell>
            </TableRow>
          )}
          {codes.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.descricao}</TableCell>
              <TableCell>{c.servico_nome ?? "—"}</TableCell>
              <TableCell>{c.codigo_tributacao_nacional ?? "—"}</TableCell>
              <TableCell>{c.codigo_tributacao_municipal ?? "—"}</TableCell>
              <TableCell>{c.cnae ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(c.aliquota_iss)}</TableCell>
              <TableCell>{c.iss_retido ? "Sim" : "Não"}</TableCell>
              <TableCell>
                <Badge variant={c.ativo ? "default" : "secondary"}>
                  {c.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Switch
                    checked={c.ativo}
                    disabled={!canEdit}
                    onCheckedChange={(v) => toggle.mutate({ id: c.id, ativo: v })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={!canEdit}
                    onClick={() => {
                      setForm(toForm(c));
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar serviço fiscal" : "Novo serviço fiscal"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Linha de serviço (opcional)</Label>
              <Select value={form.servico_id} onValueChange={(v) => set("servico_id", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem vínculo</SelectItem>
                  {(servicos ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <TextField label="CNAE" value={form.cnae} onChange={(v) => set("cnae", v)} />
            <TextField
              label="Código tributação nacional"
              value={form.codigo_tributacao_nacional}
              onChange={(v) => set("codigo_tributacao_nacional", v)}
            />
            <TextField
              label="Código tributação municipal"
              value={form.codigo_tributacao_municipal}
              onChange={(v) => set("codigo_tributacao_municipal", v)}
            />
            <TextField
              label="Tributação do município"
              value={form.tributacao_municipio}
              onChange={(v) => set("tributacao_municipio", v)}
            />
            <TextField
              label="Alíquota ISS (%)"
              value={form.aliquota_iss}
              onChange={(v) => set("aliquota_iss", v)}
            />
            <TextField label="Retenção IR (%)" value={form.retencao_ir} onChange={(v) => set("retencao_ir", v)} />
            <TextField label="Retenção PIS (%)" value={form.retencao_pis} onChange={(v) => set("retencao_pis", v)} />
            <TextField
              label="Retenção COFINS (%)"
              value={form.retencao_cofins}
              onChange={(v) => set("retencao_cofins", v)}
            />
            <TextField label="Retenção CSLL (%)" value={form.retencao_csll} onChange={(v) => set("retencao_csll", v)} />
            <TextField label="Retenção INSS (%)" value={form.retencao_inss} onChange={(v) => set("retencao_inss", v)} />

            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.iss_retido} onCheckedChange={(v) => set("iss_retido", v)} />
              ISS retido na fonte
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
              Ativo
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!form.descricao.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
