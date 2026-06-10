import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { upsertProject, type ProjectRow, type ProjectStatus } from "@/lib/projects/projects.functions";
import { listClients } from "@/lib/clients/clients.functions";
import { toast } from "sonner";

const STATUS: { value: ProjectStatus; label: string }[] = [
  { value: "planejamento", label: "Planejamento" },
  { value: "ativo", label: "Ativo" },
  { value: "aguardando_cliente", label: "Aguardando Cliente" },
  { value: "em_pausa", label: "Em Pausa" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
];

export function ProjectFormDialog({
  open, onOpenChange, project,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: Partial<ProjectRow> | null;
}) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertProject);
  const listClientsFn = useServerFn(listClients);
  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: () => listClientsFn() });

  const [form, setForm] = useState({
    name: "", description: "", client_id: "", status: "planejamento" as ProjectStatus,
    start_date: "", due_date: "", contract_value: "", color: "#6366f1",
  });

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name ?? "",
        description: project.description ?? "",
        client_id: project.client_id ?? "",
        status: (project.status as ProjectStatus) ?? "planejamento",
        start_date: project.start_date ?? "",
        due_date: project.due_date ?? "",
        contract_value: project.contract_value != null ? String(project.contract_value) : "",
        color: project.color ?? "#6366f1",
      });
    } else {
      setForm({
        name: "", description: "", client_id: "", status: "planejamento",
        start_date: "", due_date: "", contract_value: "", color: "#6366f1",
      });
    }
  }, [project, open]);

  const m = useMutation({
    mutationFn: async () =>
      upsert({
        data: {
          id: project?.id,
          name: form.name,
          description: form.description || null,
          client_id: form.client_id || null,
          status: form.status,
          start_date: form.start_date || null,
          due_date: form.due_date || null,
          contract_value: form.contract_value ? Number(form.contract_value) : null,
          color: form.color || null,
        } as any,
      }),
    onSuccess: () => {
      toast.success(project?.id ? "Projeto atualizado" : "Projeto criado");
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project-dashboard"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{project?.id ? "Editar projeto" : "Novo projeto"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="md:col-span-2">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Cliente</Label>
            <Select value={form.client_id || "none"} onValueChange={(v) => setForm({ ...form, client_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Sem cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem cliente</SelectItem>
                {(clientsQ.data?.clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Início</Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <Label>Prazo</Label>
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div>
            <Label>Valor do contrato (R$)</Label>
            <Input type="number" step="0.01" value={form.contract_value} onChange={(e) => setForm({ ...form, contract_value: e.target.value })} />
          </div>
          <div>
            <Label>Cor</Label>
            <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 p-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!form.name || m.isPending}>
            {m.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
