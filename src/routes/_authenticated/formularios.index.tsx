import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, FileText, Link2, MoreHorizontal, Plus, Power, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { FormMode } from "@/lib/forms/domain";
import { createForm, deleteForm, duplicateForm, listForms, setFormStatus } from "@/lib/forms/forms.functions";

export const Route = createFileRoute("/_authenticated/formularios/")({
  component: FormsCenter,
  head: () => ({
    meta: [
      { title: "Formulários — Hublynx Core" },
      { name: "description", content: "Crie formulários de captação com lead scoring que alimentam o pipeline." },
    ],
  }),
});

const STATUS_LABEL: Record<string, string> = { active: "Ativo", inactive: "Inativo", draft: "Rascunho" };

function FormsCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeOrganizationId, activeOrganization, isLoading: wsLoading } = useWorkspace();
  const fetchForms = useServerFn(listForms);
  const create = useServerFn(createForm);
  const duplicate = useServerFn(duplicateForm);
  const changeStatus = useServerFn(setFormStatus);
  const removeForm = useServerFn(deleteForm);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<FormMode>("scoring");

  const formsQuery = useQuery({
    queryKey: ["lead-forms", activeOrganizationId ?? "none"],
    queryFn: () => fetchForms({ data: { organizationId: activeOrganizationId } }),
    enabled: !wsLoading,
  });

  const createMutation = useMutation({
    mutationFn: () => create({ data: { name, mode, organizationId: activeOrganizationId } }),
    onSuccess: ({ formId }) => {
      setOpen(false);
      setName("");
      setMode("scoring");
      navigate({ to: "/formularios/$formId", params: { formId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const actionMutation = useMutation({
    mutationFn: async (a: { type: "duplicate" | "status" | "delete"; formId: string; status?: "active" | "inactive" }) => {
      if (a.type === "duplicate") return duplicate({ data: { formId: a.formId } });
      if (a.type === "delete") return removeForm({ data: { formId: a.formId } });
      return changeStatus({ data: { formId: a.formId, status: a.status ?? "inactive" } });
    },
    onSuccess: (result) => {
      if (result && "archived" in result && result.archived) {
        toast.info("O formulário já recebeu leads, então foi arquivado. Os leads continuam no pipeline.");
      }
      qc.invalidateQueries({ queryKey: ["lead-forms"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = formsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {activeOrganization?.name ?? "Sua empresa"}
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Formulários</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Formulários de captação com lead scoring. Cada envio vira um lead no pipeline, já classificado.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4" /> Novo formulário
        </Button>
      </div>

      {formsQuery.isLoading || wsLoading ? (
        <p className="text-sm text-muted-foreground">Carregando formulários…</p>
      ) : formsQuery.error ? (
        <p className="text-sm text-destructive">{(formsQuery.error as Error).message}</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              ["Formulários", data.stats.totalForms],
              ["Ativos", data.stats.activeForms],
              ["Leads captados", data.stats.totalLeads],
            ].map(([label, value]) => (
              <Card key={label} className="p-3 sm:p-5">
                <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground sm:text-xs">{label}</p>
                <p className="mt-1.5 text-xl font-bold tabular-nums sm:text-3xl">{value}</p>
              </Card>
            ))}
          </div>

          {data.forms.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">Seu primeiro formulário começa aqui</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Monte as perguntas, defina a pontuação de cada resposta e publique um link. Os leads caem no pipeline com a classificação no card.
              </p>
              <Button className="mt-5" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Criar formulário
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
              {data.forms.map((form) => {
                const publicPath = `/f/${form.public_id}-${form.slug}`;
                const published = Boolean(form.active_version_id);
                return (
                  <Card key={form.id} className="min-w-0 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-base font-semibold sm:text-lg">{form.name}</h2>
                          <Badge variant={form.status === "active" ? "default" : "secondary"}>
                            {STATUS_LABEL[form.status] ?? form.status}
                          </Badge>
                          <Badge variant="outline" className="font-normal">
                            {form.mode === "scoring" ? "Lead scoring" : "Captação"}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {published ? publicPath : "Ainda não publicado"}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Mais ações" className="shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => actionMutation.mutate({ type: "duplicate", formId: form.id })}>
                            <Copy className="mr-2 h-4 w-4" /> Duplicar
                          </DropdownMenuItem>
                          {published && (
                            <DropdownMenuItem
                              onClick={() =>
                                actionMutation.mutate({
                                  type: "status",
                                  formId: form.id,
                                  status: form.status === "active" ? "inactive" : "active",
                                })
                              }
                            >
                              <Power className="mr-2 h-4 w-4" /> {form.status === "active" ? "Desativar" : "Ativar"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              if (window.confirm(`Excluir "${form.name}"? Se ele já recebeu leads, será apenas arquivado.`)) {
                                actionMutation.mutate({ type: "delete", formId: form.id });
                              }
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-4 grid grid-cols-2 border-y py-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Leads (total)</p>
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">{form.leads}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">{form.leads30d}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => navigate({ to: "/formularios/$formId", params: { formId: form.id } })}>
                        <Settings2 className="h-4 w-4" /> Editar
                      </Button>
                      {published && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
                              toast.success("Link copiado");
                            }}
                          >
                            <Link2 className="h-4 w-4" /> Copiar link
                          </Button>
                          <Button size="sm" variant="ghost" asChild>
                            <a href={publicPath} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" /> Ver
                            </a>
                          </Button>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo formulário</DialogTitle>
            <DialogDescription>Dê um nome interno. Você pode alterar todos os detalhes depois.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-form-name">Nome do formulário</Label>
              <Input
                id="new-form-name"
                className="mt-2"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Campanha de franquias"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) createMutation.mutate();
                }}
              />
            </div>
            <div>
              <Label>Modelo</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as FormMode)}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scoring">Qualificação com lead scoring</SelectItem>
                  <SelectItem value="direct">Captação de dados</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                {mode === "scoring"
                  ? "Uma pergunta por etapa, com pontuação, faixas de classificação e regras."
                  : "Todos os dados em uma tela, com botão de envio."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={!name.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Criando…" : "Criar e editar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
