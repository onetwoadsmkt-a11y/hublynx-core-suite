import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { upsertClient, type ClientRow } from "@/lib/clients/clients.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

const schema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(200),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.enum(["ativo", "prospecto", "inadimplente", "inativo"]),
  service: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido").or(z.literal("")).optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  instagram: z.string().trim().max(120).optional().or(z.literal("")),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  monthly_value: z.string().optional().or(z.literal("")),
  contract_start: z.string().optional().or(z.literal("")),
  contract_renewal: z.string().optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

function toForm(c?: ClientRow | null): FormValues {
  return {
    name: c?.name ?? "",
    company: c?.company ?? "",
    status: c?.status ?? "ativo",
    service: c?.service ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    whatsapp: c?.whatsapp ?? "",
    instagram: c?.instagram ?? "",
    website: c?.website ?? "",
    address: c?.address ?? "",
    monthly_value: c?.monthly_value != null ? String(c.monthly_value) : "",
    contract_start: c?.contract_start ?? "",
    contract_renewal: c?.contract_renewal ?? "",
    notes: c?.notes ?? "",
  };
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: ClientRow | null;
}) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertClient);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toForm(client),
  });

  useEffect(() => {
    if (open) form.reset(toForm(client));
  }, [open, client, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        id: client?.id,
        name: values.name,
        status: values.status,
        company: values.company || null,
        service: values.service || null,
        email: values.email || null,
        phone: values.phone || null,
        whatsapp: values.whatsapp || null,
        instagram: values.instagram || null,
        website: values.website || null,
        address: values.address || null,
        monthly_value: values.monthly_value ? Number(values.monthly_value.replace(",", ".")) : null,
        contract_start: values.contract_start || null,
        contract_renewal: values.contract_renewal || null,
        notes: values.notes || null,
      };
      return upsert({ data: payload });
    },
    onSuccess: () => {
      toast.success(client ? "Cliente atualizado" : "Cliente cadastrado");
      qc.invalidateQueries({ queryKey: ["clients"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = form.watch("status");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{client ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] px-6">
          <form
            id="client-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-6 py-4"
          >
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Identificação
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label>Nome *</Label>
                  <Input {...form.register("name")} placeholder="Nome do cliente" />
                  {form.formState.errors.name && (
                    <p className="text-xs text-destructive mt-1">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Empresa</Label>
                  <Input {...form.register("company")} />
                </div>
                <div>
                  <Label>Status *</Label>
                  <Select
                    value={status}
                    onValueChange={(v) => form.setValue("status", v as FormValues["status"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="prospecto">Prospecto</SelectItem>
                      <SelectItem value="inadimplente">Inadimplente</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Serviço contratado</Label>
                  <Input {...form.register("service")} placeholder="Ex.: Social Media, Tráfego, Branding…" />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Contato
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>E-mail</Label>
                  <Input type="email" {...form.register("email")} />
                  {form.formState.errors.email && (
                    <p className="text-xs text-destructive mt-1">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input {...form.register("phone")} />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input {...form.register("whatsapp")} />
                </div>
                <div>
                  <Label>Instagram</Label>
                  <Input {...form.register("instagram")} placeholder="@usuario" />
                </div>
                <div>
                  <Label>Site</Label>
                  <Input {...form.register("website")} placeholder="https://" />
                </div>
                <div className="md:col-span-2">
                  <Label>Endereço</Label>
                  <Input {...form.register("address")} />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Contrato
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Valor mensal (R$)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    {...form.register("monthly_value")}
                  />
                </div>
                <div>
                  <Label>Início</Label>
                  <Input type="date" {...form.register("contract_start")} />
                </div>
                <div>
                  <Label>Renovação</Label>
                  <Input type="date" {...form.register("contract_renewal")} />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Observações
              </h4>
              <Textarea rows={4} {...form.register("notes")} />
            </section>
          </form>
        </ScrollArea>
        <DialogFooter className="px-6 pb-6 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button form="client-form" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
