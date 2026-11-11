import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { goAfterLogin } from "@/lib/auth-redirect";
import { HublynxLogo } from "@/components/HublynxLogo";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrando — Hublynx Core" }] }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Concluindo login…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      const code = query.get("code") ?? hash.get("code");
      const error = query.get("error") ?? hash.get("error");
      const errorDescription = query.get("error_description") ?? hash.get("error_description");

      if (error) {
        setMessage(`Falha no login: ${errorDescription || error}`);
        return;
      }

      // acesso direto vindo do cadastro da landing: confere o token aqui mesmo, sem passar
      // pelo redirecionamento do Supabase (que depende da lista de URLs permitidas)
      const tokenHash = query.get("token_hash");
      if (tokenHash) {
        // tenta o tipo informado e, se não bater, os outros (token recusado não é consumido)
        type OtpType = "magiclink" | "signup" | "email" | "invite" | "recovery";
        const given = (query.get("type") as OtpType | null) ?? "signup";
        const order = [given, "signup", "magiclink", "email"].filter(
          (t, i, all) => all.indexOf(t) === i,
        ) as OtpType[];
        let otpError: unknown = null;
        for (const type of order) {
          const res = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          otpError = res.error;
          if (!res.error) break;
        }
        if (cancelled) return;
        window.history.replaceState(null, "", "/auth/callback");
        if (otpError) {
          setMessage(
            "Este link de acesso já foi usado ou venceu. Se ainda não entrou, faça o cadastro de novo em coresuitecrm.com.br com o mesmo e-mail para receber outro link.",
          );
          window.setTimeout(() => window.location.replace("/auth"), 2500);
          return;
        }
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError) {
          setMessage(`Falha ao trocar código: ${exchangeError.message}`);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      // cadastro novo: confirmou o e-mail → entra com a senha provisória enviada
      if (query.get("confirmado") === "1") {
        if (data.session) await supabase.auth.signOut();
        window.location.replace("/auth?confirmado=1");
        return;
      }
      if (data.session) {
        goAfterLogin();
      } else {
        setMessage("Sessão não encontrada. Tente entrar novamente.");
      }
    }

    finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <HublynxLogo className="mb-6" />
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
