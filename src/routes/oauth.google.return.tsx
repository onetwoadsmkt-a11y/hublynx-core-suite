import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeGoogleAppUserConnect } from "@/lib/google/app-user.functions";

export const Route = createFileRoute("/oauth/google/return")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Conectando conta Google — Hublynx Core" },
      { name: "description", content: "Finalizando a autorização da sua conta Google no Hublynx." },
      { property: "og:title", content: "Conectando conta Google — Hublynx Core" },
      { property: "og:description", content: "Finalizando a autorização da conta Google." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OAuthReturn,
});

function OAuthReturn() {
  const [message, setMessage] = useState("Finalizando conexão…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectorId = params.get("connector_id") ?? "";
    const notify = (type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed") => {
      window.opener?.postMessage({ type, connectorId }, window.location.origin);
      window.close();
    };
    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "A autorização não foi concluída.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("Autorização concluída sem código de troca.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    void completeGoogleAppUserConnect({ data: { code } })
      .then(() => notify("appUserConnectorOAuthComplete"))
      .catch(() => {
        setMessage("Não foi possível finalizar a conexão.");
        notify("appUserConnectorOAuthFailed");
      });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
