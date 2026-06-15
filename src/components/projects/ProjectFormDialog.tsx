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

type CommercialModel = "projeto_fechado" | "mensal_recorrente" | "banco_horas" | "por_hora" | "suporte_continuo";
type ServiceType = "desenvolvimento" | "trafego_pago" | "gestao_conteudo" | "consultoria" | "design" | "suporte" | "outros";

const COMMERCIAL: { value: CommercialModel; label: string }[] = [
  { value: "projeto_fechado", label: "Projeto Fechado" },
  { value: "mensal_recorrente", label: "Mensal Recorrente" },
  { value: "banco_horas", label: "Banco de Horas" },
  { value: "por_hora", label: "Cobrança por Hora" },
  { value: "suporte_continuo", label: "Suporte Contínuo" },
];

const SERVICE: { value: ServiceType; label: string }[] = [
  { value: "desenvolvimento", label: "Desenvolvimento de Sistemas" },
  { value: "trafego_pago", label: "Tráfego Pago" },
  { value: "gestao_conteudo", label: "Gestão de Conteúdo" },
  { value: "consultoria", label: "Consultoria" },
  { value: "design", label: "Design" },
  { value: "suporte", label: "Suporte" },
  { value: "outros", label: "Outros" },
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
    service_type: "" as ServiceType | "",
    commercial_model: "projeto_fechado" as CommercialModel,
    hourly_rate: "", contracted_hours: "", monthly_value: "",
    billing_day: "", next_billing_date: "",
  });

  useEffect(() => {
    if (project) {
      const p: any = project;
      setForm({
        name: p.name ?? "",
        description: p.description ?? "",
        client_id: p.client_id ?? "",
        status: (p.status as ProjectStatus) ?? "planejamento",
        start_date: p.start_date ?? "",
        due_date: p.due_date ?? "",
        contract_value: p.contract_value != null ? String(p.contract_value) : "",
        color: p.color ?? "#6366f1",
        service_type: (p.service_type ?? "") as any,
        commercial_model: (p.commercial_model ?? "projeto_fechado") as CommercialModel,
        hourly_rate: p.hourly_rate != null ? String(p.hourly_rate) : "",
        contracted_hours: p.contracted_hours != null ? String(p.contracted_hours) : "",
        monthly_value: p.monthly_value != null ? String(p.monthly_value) : "",
        billing_day: p.billing_day != null ? String(p.billing_day) : "",
        next_billing_date: p.next_billing_date ?? "",
      });
    } else {
      setForm({
        name: "", description: "", client_id: "", status: "planejamento",
        start_date: "", due_date: "", contract_value: "", color: "#6366f1",
        service_type: "", commercial_model: "projeto_fechado",
        hourly_rate: "", contracted_hours: "", monthly_value: "",
        billing_day: "", next_billing_date: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, (project as any)?.id]);

  const m = useMutation({
    mutationFn: async () =>
      upsert({
        data: {
          id: (project as any)?.id,
          name: form.name,
          description: form.description || null,
          client_id: form.client_id || null,
          status: form.status,
          start_date: form.start_date || null,
          due_date: form.due_date || null,
          contract_value: form.contract_value ? Number(form.contract_value) : null,
          color: form.color || null,
          service_type: (form.service_type || null) as any,
          commercial_model: form.commercial_model,
          hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
          contracted_hours: form.contracted_hours ? Number(form.contracted_hours) : null,
          monthly_value: form.monthly_value ? Number(form.monthly_value) : null,
          billing_day: form.billing_day ? Number(form.billing_day) : null,
          next_billing_date: form.next_billing_date || null,
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

  const model = form.commercial_model;
  const showContract = model === "projeto_fechado";
  const showMonthly = model === "mensal_recorrente" || model === "suporte_continuo";
  const showHourly = model === "por_hora" || model === "banco_horas";
  const showHoursBank = model === "banco_horas";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
            <Label>Tipo de Serviço</Label>
            <Select value={form.service_type || "none"} onValueChange={(v) => setForm({ ...form, service_type: (v === "none" ? "" : v) as any })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {SERVICE.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Modelo Comercial *</Label>
            <Select value={form.commercial_model} onValueChange={(v) => setForm({ ...form, commercial_model: v as CommercialModel })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMMERCIAL.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
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

          {showContract && (
            <div className="md:col-span-2">
              <Label>Valor do contrato (R$)</Label>
              <Input type="number" step="0.01" value={form.contract_value} onChange={(e) => setForm({ ...form, contract_value: e.target.value })} />
            </div>
          )}

          {showMonthly && (
            <>
              <div>
                <Label>Valor mensal (R$)</Label>
                <Input type="number" step="0.01" value={form.monthly_value} onChange={(e) => setForm({ ...form, monthly_value: e.target.value })} />
              </div>
              <div>
                <Label>Dia da cobrança (1-28)</Label>
                <Input type="number" min={1} max={28} value={form.billing_day} onChange={(e) => setForm({ ...form, billing_day: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Próxima cobrança</Label>
                <Input type="date" value={form.next_billing_date} onChange={(e) => setForm({ ...form, next_billing_date: e.target.value })} />
              </div>
            </>
          )}

          {showHourly && (
            <div>
              <Label>Valor por hora (R$)</Label>
              <Input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} />
            </div>
          )}
          {showHoursBank && (
            <div>
              <Label>Horas contratadas</Label>
              <Input type="number" step="0.25" value={form.contracted_hours} onChange={(e) => setForm({ ...form, contracted_hours: e.target.value })} />
            </div>
          )}

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
