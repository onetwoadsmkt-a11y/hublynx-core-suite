import { createFileRoute } from "@tanstack/react-router";
import { GoogleAccountCard } from "@/components/google/GoogleAccountCard";
import { GoogleConnectionCard } from "@/components/google/GoogleConnectionCard";

export const Route = createFileRoute("/_authenticated/configuracoes/integracoes/")({
  head: () => ({
    meta: [
      { title: "Integrações — Hublynx Core" },
      { name: "description", content: "Gerencie a conta Google usada para entrar no Hublynx Core." },
      { property: "og:title", content: "Integrações — Hublynx Core" },
      { property: "og:description", content: "Conta Google usada para autenticação no Hublynx Core." },
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
        <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground">
          Autenticação da sua conta no Hublynx Core.
        </p>
      </header>
      <GoogleAccountCard />
    </div>
  );
}
