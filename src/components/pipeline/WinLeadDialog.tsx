import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight, Building2, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { convertLeadToClient } from "@/lib/pipeline/conversion.functions";
import { listProjectTemplates } from "@/lib/projects/stages.functions";
import { useQuery } from "@tanstack/react-query";
import type { Lead } from "./types";

const MODELS = [
  { value: "projeto_fechado", label: "Projeto fechado" },
  { value: "mensal_recorrente", label: "Mensal recorrente" },
  { value: "banco_horas", label: "Banco de horas" },
  { value: "por_hora", label: "Por hora" },
  { value: "suporte_continuo", label: "Suporte contínuo" },
] as const;

const SERVICES = [
  { value: "desenvolvimento", label: "Desenvolvimento" },
  { value: "trafego_pago", label: "Tráfego pago" },
  { value: "gestao_conteudo", label: "Gestão de conteúdo" },
  { value: "consultoria", label: "Consultoria" },
  { value: "design", label: "Design" },
  { value: "suporte", label: "Suporte" },
  { value: "outros", label: "Outros" },
] as const;

type Model = (typeof MODELS)[number]["value"];
type Service = (typeof SERVICES)[number]["value"];

const today = () => new Date().toISOString().slice(0, 10);

export function WinLeadDialog({
  lead,
  onOpenChange,
}: {
  lead: Lead | null;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const convert = useServerFn(convertLeadToClient);

  const [clientName, setClientName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [projectName, setProjectName] = useState("");
  const [service, setService] = useState<Service>("outros");
  const [model, setModel] = useState<Model>("projeto_fechado");
  const [value, setValue] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [templateId, setTemplateId] = useState<string>("none");

  const templatesFn = useServerFn(listProjectTemplates);
  const templatesQ = useQuery({
    queryKey: ["project-templates"],
    queryFn: () => templatesFn(),
    enabled: !!lead,
    staleTime: 5 * 60_000,
  });
  const templates = templatesQ.data ?? [];

  useEffect(() => {
    if (!lead) return;
    setClientName(lead.company || lead.name || "");
    setCompany(lead.company ?? "");
    setEmail(lead.email ?? "");
    setPhone(lead.phone ?? "");
    setProjectName(lead.name ? `Projeto — ${lead.company || lead.name}` : "Novo projeto");
    setService("outros");
    setModel("projeto_fechado");
    setValue(lead.value != null ? String(lead.value) : "");
    setStartDate(today());
    setTemplateId("none");
  }, [lead]);

  const num = (s: string) => {
    const n = Number(String(s).replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const recurring = model === "mensal_recorrente";
  const total = num(value);

  const run = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("Lead inválido");
      if (!clientName.trim()) throw new Error("Informe o nome do cliente.");
      if (!projectName.trim()) throw new Error("Informe o nome do projeto.");
      return convert({
        data: {
          leadId: lead.id,
          clientId: lead.client_id ?? null,
          templateId: templateId !== "none" ? templateId : null,
          client: {
            name: clientName.trim(),
            company: company || null,
            email: email || null,
            phone: phone || null,
          },
          project: {
            name: projectName.trim(),
            service_type: service,
            commercial_model: model,
            contract_value: recurring ? null : total || null,
            monthly_value: recurring ? total || null : null,
            start_date: startDate || null,
          },
        },
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Cliente e projeto criados a partir do lead");
      onOpenChange(false);
      navigate({ to: "/projetos/$id", params: { id: res.projectId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!lead} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Converter lead em cliente</DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-xs">
            Lead <ArrowRight className="h-3 w-3" /> Cliente <ArrowRight className="h-3 w-3" /> Projeto
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-6 overflow-y-auto pr-1">
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary" /> Cliente
            </h3>
            {lead?.client_id ? (
              <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                Este lead já está vinculado a um cliente — o projeto será criado nele.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nome *</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Empresa</Label>
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FolderKanban className="h-4 w-4 text-primary" /> Projeto
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nome do projeto *</Label>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Serviço</Label>
                <Select value={service} onValueChange={(v) => setService(v as Service)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Modelo comercial</Label>
                <Select value={model} onValueChange={(v) => setModel(v as Model)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{recurring ? "Valor mensal (R$)" : "Valor do contrato (R$)"}</Label>
                <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              {!recurring && templates.length > 0 && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Modelo de roadmap</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger><SelectValue placeholder="Sem modelo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem modelo</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </section>

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Agora não</Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "Criando..." : "Criar cliente e projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
