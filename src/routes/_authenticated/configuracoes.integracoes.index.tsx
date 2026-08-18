import { createFileRoute } from "@tanstack/react-router";
import { GoogleAccountCard } from "@/components/google/GoogleAccountCard";
import { GoogleOAuthAdminCard } from "@/components/google/GoogleOAuthAdminCard";
import { GoogleServicesCard } from "@/components/google/GoogleServicesCard";
import { GoogleDiagnosticsCard } from "@/components/google/GoogleDiagnosticsCard";

export const Route = createFileRoute("/_authenticated/configuracoes/integracoes/")({
  head: () => ({
    meta: [
      { title: "Integração Google — Hublynx Core" },
      {
        name: "description",
        content: "Configure o cliente OAuth e conecte Gmail, Google Agenda e Drive.",
      },
      { property: "og:title", content: "Integração Google — Hublynx Core" },
      {
        property: "og:description",
        content: "Credenciais OAuth, conexão por usuário e diagnóstico da integração Google.",
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
          OAuth 2.0 próprio do app: o administrador cadastra o cliente OAuth e cada usuário conecta
          a própria conta para usar Agenda, Drive e Gmail.
        </p>
      </header>
      <GoogleOAuthAdminCard />
      <GoogleServicesCard />
      <GoogleDiagnosticsCard />
      <GoogleAccountCard />
    </div>
  );
}
