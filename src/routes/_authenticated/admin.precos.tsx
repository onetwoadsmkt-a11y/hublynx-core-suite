import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  getPricing, savePricing, listTiers, saveTier, deleteTier, type Tier,
} from "@/lib/platform/platform.functions";

export const Route = createFileRoute("/_authenticated/admin/precos")({
  head: () => ({
    meta: [
      { title: "Preços e faixas — Central Administrativa Hublynx" },
      { name: "description", content: "Defina o preço dos módulos, usuários incluídos e as faixas de banco e arquivos." },
      { property: "og:title", content: "Preços e faixas — Central Administrativa Hublynx" },
      { property: "og:description", content: "Tabela de preços e limites de recursos por faixa de usuários." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PricingPage,
});

const PRICE_FIELDS: { key: string; label: string; suffix: string }[] = [
  { key: "crm_monthly_price", label: "Hublynx CRM (mensal)", suffix: "R$" },
  { key: "projects_monthly_price", label: "Hublynx Projects (mensal)", suffix: "R$" },
  { key: "included_users", label: "Usuários incluídos", suffix: "un." },
  { key: "additional_user_price", label: "Usuário adicional (mensal)", suffix: "R$" },
];

function PricingPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getPricing);
  const saveFn = useServerFn(savePricing);
  const tiersFn = useServerFn(listTiers);
  const saveTierFn = useServerFn(saveTier);
  const delTierFn = useServerFn(deleteTier);

  const pricingQ = useQuery({ queryKey: ["platform-pricing"], queryFn: () => getFn(), staleTime: 60_000 });
  const tiersQ = useQuery({ queryKey: ["platform-tiers"], queryFn: () => tiersFn(), staleTime: 60_000 });

  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!pricingQ.data) return;
    setValues(
      Object.fromEntries(PRICE_FIELDS.map((f) => [f.key, String(pricingQ.data.pricing[f.key] ?? 0)])),
    );
  }, [pricingQ.data]);

  const saveM = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          entries: PRICE_FIELDS.map((f) => ({ key: f.key, value: Number(values[f.key] ?? 0) })),
        },
      }),
    onSuccess: () => {
      toast.success("Preços atualizados");
      qc.invalidateQueries({ queryKey: ["platform-pricing"] });
      qc.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => delTierFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Faixa removida");
      qc.invalidateQueries({ queryKey: ["platform-tiers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tier | null>(null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Preços e faixas</h1>
        <p className="text-sm text-muted-foreground">
          Valores usados no simulador e no cálculo da receita recorrente.
        </p>
      </div>

      <Card className="rounded-2xl p-4 space-y-4">
        <p className="text-sm font-medium">Tabela de preços</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PRICE_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label} <span className="text-muted-foreground">({f.suffix})</span></Label>
              <Input
                type="number"
                min={0}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>Salvar preços</Button>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Faixas de recursos</p>
          <Button variant="outline" size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Nova faixa
          </Button>
        </div>
        {(tiersQ.data ?? []).filter((t) => t.active).map((t) => (
          <Card key={t.id} className="rounded-2xl p-4 flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{t.name ?? `${t.min_users}+ usuários`}</p>
              <p className="text-xs text-muted-foreground">
                {t.min_users}–{t.max_users ?? "∞"} usuários · banco {t.database_limit_mb} MB · arquivos{" "}
                {t.storage_limit_mb} MB{t.custom ? " · personalizada" : ""}
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" aria-label="Editar faixa" onClick={() => { setEditing(t); setOpen(true); }}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remover faixa"
                className="text-rose-600"
                onClick={() => { if (confirm("Remover esta faixa?")) delM.mutate(t.id); }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <TierDialog
        open={open}
        onOpenChange={setOpen}
        tier={editing}
        save={(p) => saveTierFn({ data: p })}
        onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["platform-tiers"] }); }}
      />
    </div>
  );
}

function TierDialog({
  open, onOpenChange, tier, save, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tier: Tier | null;
  save: (p: any) => Promise<any>;
  onSaved: () => void;
}) {
  const [f, setF] = useState({ name: "", min_users: 1, max_users: "", database_limit_mb: 250, storage_limit_mb: 2048 });

  useEffect(() => {
    if (!open) return;
    setF({
      name: tier?.name ?? "",
      min_users: tier?.min_users ?? 1,
      max_users: tier?.max_users == null ? "" : String(tier.max_users),
      database_limit_mb: tier?.database_limit_mb ?? 250,
      storage_limit_mb: tier?.storage_limit_mb ?? 2048,
    });
  }, [open, tier]);

  const m = useMutation({
    mutationFn: () =>
      save({
        ...(tier ? { id: tier.id } : {}),
        name: f.name.trim() || null,
        min_users: Number(f.min_users) || 1,
        max_users: f.max_users ? Number(f.max_users) : null,
        database_limit_mb: Number(f.database_limit_mb) || 0,
        storage_limit_mb: Number(f.storage_limit_mb) || 0,
        custom: !f.max_users,
        active: true,
      }),
    onSuccess: () => { toast.success("Faixa salva"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{tier ? "Editar faixa" : "Nova faixa"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nome</Label>
            <Input value={f.name} onChange={(e) => setF((v) => ({ ...v, name: e.target.value }))} placeholder="Ex.: 4 a 10 usuários" />
          </div>
          <div className="space-y-1.5">
            <Label>De (usuários)</Label>
            <Input type="number" min={1} value={f.min_users} onChange={(e) => setF((v) => ({ ...v, min_users: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Até (vazio = sem limite)</Label>
            <Input type="number" min={1} value={f.max_users} onChange={(e) => setF((v) => ({ ...v, max_users: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Banco (MB)</Label>
            <Input type="number" min={0} value={f.database_limit_mb} onChange={(e) => setF((v) => ({ ...v, database_limit_mb: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Arquivos (MB)</Label>
            <Input type="number" min={0} value={f.storage_limit_mb} onChange={(e) => setF((v) => ({ ...v, storage_limit_mb: Number(e.target.value) }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
