import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Pencil, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteClient, type ClientRow } from "@/lib/clients/clients.functions";
import { ClientDocumentsTab } from "./ClientDocumentsTab";
import { ClientHistoryTab } from "./ClientHistoryTab";
import { ClientProjectsTab } from "./ClientProjectsTab";
import { ClientFormDialog } from "./ClientFormDialog";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className="text-sm mt-0.5">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

export function ClientDrawer({
  client,
  open,
  onOpenChange,
}: {
  client: ClientRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const delFn = useServerFn(deleteClient);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Lead removido");
      qc.invalidateQueries({ queryKey: ["clients"] });
      onOpenChange(false);
      setConfirmDel(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!client) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle className="truncate">{client.name}</SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline">{client.status}</Badge>
                  {client.company && (
                    <span className="text-sm text-muted-foreground truncate">{client.company}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-1" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDel(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          <Tabs defaultValue="dados" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-6 mt-2 self-start">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="projetos">Projetos</TabsTrigger>
              <TabsTrigger value="docs">Contratos & Documentos</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <TabsContent value="dados" className="px-6 py-4 space-y-5 mt-0">
                <section className="grid grid-cols-2 gap-4">
                  <Field label="Serviço" value={client.service} />
                  <Field
                    label="Valor mensal"
                    value={
                      client.monthly_value != null
                        ? `R$ ${Number(client.monthly_value).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}`
                        : null
                    }
                  />
                  <Field label="Início contrato" value={client.contract_start} />
                  <Field label="Renovação" value={client.contract_renewal} />
                </section>
                <Separator />
                <section className="grid grid-cols-2 gap-4">
                  <Field label="E-mail" value={client.email} />
                  <Field label="Telefone" value={client.phone} />
                  <Field label="WhatsApp" value={client.whatsapp} />
                  <Field label="Instagram" value={client.instagram} />
                  <Field label="Site" value={client.website} />
                  <Field label="Endereço" value={client.address} />
                </section>
                {client.notes && (
                  <>
                    <Separator />
                    <Field label="Observações" value={<span className="whitespace-pre-wrap">{client.notes}</span>} />
                  </>
                )}
              </TabsContent>

              <TabsContent value="projetos" className="px-6 py-4 mt-0">
                <ClientProjectsTab clientId={client.id} />
              </TabsContent>

              <TabsContent value="docs" className="px-6 py-4 mt-0">
                <ClientDocumentsTab clientId={client.id} />
              </TabsContent>

              <TabsContent value="historico" className="px-6 py-4 mt-0">
                <ClientHistoryTab clientId={client.id} />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </SheetContent>
      </Sheet>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} />

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Projetos, tarefas e finanças vinculados
              perderão a referência ao cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => del.mutate(client.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
