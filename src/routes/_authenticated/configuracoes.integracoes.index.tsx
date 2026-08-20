import { createFileRoute } from "@tanstack/react-router";
import { GoogleAccountCard } from "@/components/google/GoogleAccountCard";
import { GoogleServicesCard } from "@/components/google/GoogleServicesCard";
import { GoogleDiagnosticsCard } from "@/components/google/GoogleDiagnosticsCard";

export const Route = createFileRoute("/_authenticated/configuracoes/integracoes/")({
  head: () => ({
    meta: [
      { title: "Integração Google — Hublynx Core" },
      {
        name: "description",
        content: "Conecte sua conta Google para usar Gmail, Google Agenda e Drive no Hublynx.",
      },
      { property: "og:title", content: "Integração Google — Hublynx Core" },
      {
        property: "og:description",
        content: "Conexão por usuário e diagnóstico da integração Google.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntegracoesPage,
});

function IntegracoesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Integração Google</h1>
        <p className="text-muted-foreground">
          Conecte a sua conta Google para usar Agenda, Drive e Gmail dentro do sistema.
        </p>
      </header>
      <GoogleServicesCard />
      <GoogleDiagnosticsCard />
      <GoogleAccountCard />
    </div>
  );
}
