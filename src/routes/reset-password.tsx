import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Redefinir senha — Hublynx Core" }] }),
  component: ResetPage,
});

type Status = "checking" | "ready" | "invalid";

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>("checking");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function establishSession() {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      const err = query.get("error_description") ?? hash.get("error_description") ?? query.get("error") ?? hash.get("error");
      if (err) {
        if (!cancelled) {
          setErrorMsg(decodeURIComponent(err));
          setStatus("invalid");
        }
        return;
      }

      // 1) Fluxo PKCE: ?code=...
      const code = query.get("code") ?? hash.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          if (!cancelled) setStatus("ready");
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }
      }

      // 2) Fluxo implícito: #access_token=...&refresh_token=...
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          if (!cancelled) setStatus("ready");
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }
      }

      // 3) Sessão já existente (recovery ou usuário logado)
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setStatus("ready");
        return;
      }

      setErrorMsg("Não foi possível validar o link de recuperação.");
      setStatus("invalid");
    }

    establishSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return toast.error("As senhas não conferem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    toast.success("Senha redefinida com sucesso");
    await supabase.auth.signOut();
    setLoading(false);
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="w-full max-w-md shadow-[var(--shadow-card)]">
        <CardHeader><CardTitle>Definir nova senha</CardTitle></CardHeader>
        <CardContent>
          {status === "checking" && (
            <p className="text-sm text-muted-foreground">Validando link de recuperação…</p>
          )}

          {status === "invalid" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                O link de recuperação é inválido ou expirou. {errorMsg}
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Voltar para o login
              </Button>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="np">Nova senha</Label>
                <Input id="np" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp">Confirmar nova senha</Label>
                <Input id="cp" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Salvando..." : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
