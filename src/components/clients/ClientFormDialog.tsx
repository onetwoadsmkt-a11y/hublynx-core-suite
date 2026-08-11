import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { upsertClient, type ClientRow } from "@/lib/clients/clients.functions";
import { listProjects } from "@/lib/projects/projects.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

const schema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(200),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.enum(["ativo", "prospecto", "inadimplente", "inativo"]),
  email: z.string().trim().email("E-mail inválido").or(z.literal("")).optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  instagram: z.string().trim().max(120).optional().or(z.literal("")),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

function toForm(c?: ClientRow | null): FormValues {
  return {
    name: c?.name ?? "",
    company: c?.company ?? "",
    status: c?.status ?? "ativo",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    whatsapp: c?.whatsapp ?? "",
    instagram: c?.instagram ?? "",
    website: c?.website ?? "",
    address: c?.address ?? "",
    notes: c?.notes ?? "",
  };
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  planejamento: "Planejamento",
  ativo: "Ativo",
  aguardando_cliente: "Aguardando cliente",
  em_pausa: "Em pausa",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

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
  const listProjectsFn = useServerFn(listProjects);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toForm(client),
  });

  useEffect(() => {
    if (open) form.reset(toForm(client));
  }, [open, client, form]);

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjectsFn(),
    enabled: open && !!client?.id,
  });

  const clientProjects = (projectsData?.projects ?? []).filter(
    (p: any) => p.client_id === client?.id,
  );
  const ongoing = clientProjects.filter(
    (p: any) => p.status !== "concluido" && p.status !== "cancelado",
  );
  const finished = clientProjects.filter((p: any) => p.status === "concluido");

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        id: client?.id,
        name: values.name,
        status: values.status,
        company: values.company || null,
        email: values.email || null,
        phone: values.phone || null,
        whatsapp: values.whatsapp || null,
        instagram: values.instagram || null,
        website: values.website || null,
        address: values.address || null,
        notes: values.notes || null,
      };
      return upsert({ data: payload });
    },
    onSuccess: () => {
      toast.success(client ? "Lead atualizado" : "Lead cadastrado");
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
          <DialogTitle>{client ? "Editar lead" : "Novo lead"}</DialogTitle>
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
                  <Input {...form.register("name")} placeholder="Nome do lead" />
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
                Observações
              </h4>
              <Textarea rows={4} {...form.register("notes")} />
            </section>

            {client?.id && (
              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Projetos deste lead
                </h4>
                {clientProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum projeto vinculado a este lead.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <ProjectList title="Em andamento" projects={ongoing} />
                    <ProjectList title="Finalizados" projects={finished} />
                  </div>
                )}
              </section>
            )}
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

function ProjectList({ title, projects }: { title: string; projects: any[] }) {
  if (projects.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-1.5">
        {projects.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{p.name}</p>
              {p.due_date && (
                <p className="text-xs text-muted-foreground">
                  Prazo: {format(new Date(p.due_date), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              )}
            </div>
            <Badge variant="outline" className="shrink-0 text-xs">
              {PROJECT_STATUS_LABEL[p.status] ?? p.status}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
