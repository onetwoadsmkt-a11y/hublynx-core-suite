import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Users, Wallet, HardDrive, FileSignature } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getPlatformOverview } from "@/lib/platform/platform.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Visão geral da plataforma — Hublynx" },
      { name: "description", content: "Empresas ativas, usuários, receita recorrente e uso de armazenamento." },
      { property: "og:title", content: "Visão geral da plataforma — Hublynx" },
      { property: "og:description", content: "Indicadores da operação Hublynx em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOverview,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function AdminOverview() {
  const fn = useServerFn(getPlatformOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!data) return null;

  const cards = [
    { label: "Empresas ativas", value: `${data.activeOrganizations}/${data.organizations}`, icon: Building2 },
    { label: "Usuários ativos", value: String(data.users), icon: Users },
    { label: "Receita recorrente", value: brl(data.mrr), icon: Wallet },
    { label: "Propostas em aberto", value: String(data.simulationsOpen), icon: FileSignature },
    { label: "Armazenamento usado", value: `${data.storageTotalMb.toFixed(1)} MB`, icon: HardDrive },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Visão geral da plataforma</h1>
        <p className="text-sm text-muted-foreground">Como está a operação Hublynx hoje.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="rounded-2xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <c.icon className="h-4 w-4" />
              <span className="text-xs">{c.label}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{c.value}</p>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl p-4">
        <p className="text-sm font-medium">Módulos contratados</p>
        <div className="mt-3 space-y-2">
          {data.byModule.map((m) => (
            <div key={m.code} className="flex items-center justify-between text-sm">
              <span>{m.name}</span>
              <span className="text-muted-foreground">{m.organizations} empresa(s)</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
