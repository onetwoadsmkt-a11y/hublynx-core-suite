import { createFileRoute } from "@tanstack/react-router";
import { GoogleConnectionCard } from "@/components/google/GoogleConnectionCard";

export const Route = createFileRoute("/_authenticated/configuracoes/integracoes")({
  head: () => ({ meta: [{ title: "Integrações — Hublynx Core" }] }),
  component: IntegracoesPage,
});

function IntegracoesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground">
          Conecte ferramentas externas à sua conta Hublynx. Cada usuário gerencia as próprias conexões.
        </p>
      </header>
      <GoogleConnectionCard />
    </div>
  );
}
