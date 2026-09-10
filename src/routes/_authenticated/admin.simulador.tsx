import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getPricing, listTiers, listSimulations, saveSimulation, setSimulationStatus,
} from "@/lib/platform/platform.functions";

export const Route = createFileRoute("/_authenticated/admin/simulador")({
  head: () => ({
    meta: [
      { title: "Simulador comercial — Hublynx" },
      { name: "description", content: "Monte propostas com módulos, usuários e limites de recursos em segundos." },
      { property: "og:title", content: "Simulador comercial — Hublynx" },
      { property: "og:description", content: "Simule mensalidade e anuidade por módulos e número de usuários." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimulatorPage,
});

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MODULES = [
  { code: "crm", label: "Hublynx CRM", priceKey: "crm_monthly_price" },
  { code: "projects", label: "Hublynx Projects", priceKey: "projects_monthly_price" },
];

const SIM_STATUS: Record<string, string> = {
  open: "Em aberto",
  proposal: "Proposta enviada",
  approved: "Aprovada",
  converted: "Convertida",
  lost: "Perdida",
};

function SimulatorPage() {
  const qc = useQueryClient();
  const pricingFn = useServerFn(getPricing);
  const tiersFn = useServerFn(listTiers);
  const listFn = useServerFn(listSimulations);
  const saveFn = useServerFn(saveSimulation);
  const statusFn = useServerFn(setSimulationStatus);

  const pricingQ = useQuery({ queryKey: ["platform-pricing"], queryFn: () => pricingFn(), staleTime: 60_000 });
  const tiersQ = useQuery({ queryKey: ["platform-tiers"], queryFn: () => tiersFn(), staleTime: 60_000 });
  const simsQ = useQuery({ queryKey: ["platform-simulations"], queryFn: () => listFn(), staleTime: 30_000 });

  const [form, setForm] = useState({
    company_name: "", contact_name: "", email: "", phone: "", notes: "", total_users: 3,
  });
  const [selected, setSelected] = useState<string[]>(["crm"]);

  const pricing = pricingQ.data?.pricing ?? {};
  const calc = useMemo(() => {
    const moduleTotal = MODULES.filter((m) => selected.includes(m.code)).reduce(
      (sum, m) => sum + (pricing[m.priceKey] ?? 0), 0,
    );
    const included = pricing["included_users"] ?? 0;
    const extraUsers = Math.max(0, form.total_users - included);
    const userTotal = extraUsers * (pricing["additional_user_price"] ?? 0);
    const monthly = moduleTotal + userTotal;
    const tier = (tiersQ.data ?? []).find(
      (t) => t.active && form.total_users >= t.min_users && (t.max_users == null || form.total_users <= t.max_users),
    );
    return { moduleTotal, extraUsers, userTotal, monthly, annual: monthly * 12, tier };
  }, [selected, pricing, form.total_users, tiersQ.data]);

  const saveM = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          company_name: form.company_name.trim(),
          contact_name: form.contact_name.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          modules: selected,
          total_users: form.total_users,
          module_total: calc.moduleTotal,
          additional_users: calc.extraUsers,
          user_total: calc.userTotal,
          monthly_total: calc.monthly,
          annual_total: calc.annual,
          database_limit_mb: calc.tier?.database_limit_mb ?? null,
          storage_limit_mb: calc.tier?.storage_limit_mb ?? null,
          pricing_snapshot: pricing,
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Simulação salva");
      qc.invalidateQueries({ queryKey: ["platform-simulations"] });
      qc.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusM = useMutation({
    mutationFn: (v: { id: string; status: any }) => statusFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-simulations"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Simulador comercial</h1>
        <p className="text-sm text-muted-foreground">Monte a proposta e salve o histórico de negociação.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="rounded-2xl p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Empresa</Label>
              <Input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Contato</Label>
              <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Usuários</Label>
              <Input
                type="number"
                min={1}
                value={form.total_users}
                onChange={(e) => setForm((f) => ({ ...f, total_users: Math.max(1, Number(e.target.value) || 1) }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Módulos</Label>
            <div className="flex flex-wrap gap-4">
              {MODULES.map((m) => (
                <label key={m.code} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(m.code)}
                    onCheckedChange={(v) =>
                      setSelected((s) => (v ? [...s, m.code] : s.filter((c) => c !== m.code)))
                    }
                  />
                  {m.label} <span className="text-muted-foreground">{brl(pricing[m.priceKey] ?? 0)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>

          <Button
            disabled={saveM.isPending}
            onClick={() => {
              if (!form.company_name.trim()) return toast.error("Informe o nome da empresa");
              saveM.mutate();
            }}
          >
            Salvar simulação
          </Button>
        </Card>

        <Card className="rounded-2xl p-4 space-y-3 h-fit">
          <p className="text-sm font-medium">Resumo</p>
          <Row label="Módulos" value={brl(calc.moduleTotal)} />
          <Row label={`Usuários adicionais (${calc.extraUsers})`} value={brl(calc.userTotal)} />
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground">Mensal</p>
            <p className="text-2xl font-semibold">{brl(calc.monthly)}</p>
            <p className="text-xs text-muted-foreground mt-1">Anual: {brl(calc.annual)}</p>
          </div>
          {calc.tier && (
            <div className="border-t pt-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{calc.tier.name}</p>
              <p>Banco {calc.tier.database_limit_mb} MB · Arquivos {calc.tier.storage_limit_mb} MB</p>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Simulações recentes</p>
        {(simsQ.data ?? []).map((s) => (
          <Card key={s.id} className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{s.company_name}</p>
                <Badge variant="secondary">{SIM_STATUS[s.status] ?? s.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {s.total_users} usuário(s) · {s.modules.join(", ") || "sem módulos"} ·{" "}
                {brl(Number(s.monthly_total))}/mês
              </p>
            </div>
            <Select value={s.status} onValueChange={(v) => statusM.mutate({ id: s.id, status: v })}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SIM_STATUS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
