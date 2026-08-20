import { createFileRoute } from "@tanstack/react-router";
import { ImapSmtpCard } from "@/components/mail/ImapSmtpCard";
import { GoogleAccountCard } from "@/components/google/GoogleAccountCard";
import { GoogleServicesCard } from "@/components/google/GoogleServicesCard";

export const Route = createFileRoute("/_authenticated/configuracoes/integracoes/")({
  head: () => ({
    meta: [
      { title: "Integrações de e-mail — Hublynx Core" },
      {
        name: "description",
        content: "Conecte sua conta Google para usar Gmail, Google Agenda e Drive no Hublynx.",
      },
      { property: "og:title", content: "Integrações de e-mail — Hublynx Core" },
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
        <h1 className="text-2xl font-bold tracking-tight">Integrações de e-mail</h1>
        <p className="text-muted-foreground">
          Conecte sua conta Google (Agenda, Drive e Gmail) ou outro provedor via IMAP/SMTP.
        </p>
      </header>
      <GoogleServicesCard />
      <GoogleAccountCard />
      <ImapSmtpCard />
    </div>
  );
}
