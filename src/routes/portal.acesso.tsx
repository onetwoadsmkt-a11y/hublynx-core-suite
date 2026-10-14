import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Chegada do convite: abre a sessão do link e pede para o cliente criar a senha. */
export const Route = createFileRoute("/portal/acesso")({
  ssr: false,
  head: () => ({ meta: [{ title: "Acesso ao portal do cliente" }] }),
  component: PortalAccessPage,
});

type Status = "checking" | "ready" | "invalid";

function PortalAccessPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const err = query.get("error_description") ?? hash.get("error_description");
      if (err) {
        if (!cancelled) {
          setError(decodeURIComponent(err));
          setStatus("invalid");
        }
        return;
      }
      const code = query.get("code");
      if (code) await supabase.auth.exchangeCodeForSession(code).catch(() => null);
      const at = hash.get("access_token");
      const rt = hash.get("refresh_token");
      if (at && rt)
        await supabase.auth.setSession({ access_token: at, refresh_token: rt }).catch(() => null);
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      {
        const nx = new URLSearchParams(window.location.search).get("next");
        window.history.replaceState({}, "", window.location.pathname + (nx ? `?next=${encodeURIComponent(nx)}` : ""));
      }
      setStatus(data.session ? "ready" : "invalid");
      if (!data.session) setError("O link expirou ou já foi usado. Peça um novo convite à equipe.");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function goNext() {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && /^\/portal\/[a-z0-9-]+$/i.test(next)) {
      window.location.assign(next);
      return;
    }
    navigate({ to: "/portal", replace: true });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("A senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirm) return toast.error("As senhas não conferem.");
    setSaving(true);
    const { error: upErr } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (upErr) return toast.error(upErr.message);
    toast.success("Senha criada. Bem-vindo ao portal!");
    goNext();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Portal do cliente</CardTitle>
        </CardHeader>
        <CardContent>
          {status === "checking" && (
            <p className="text-sm text-muted-foreground">Validando seu acesso…</p>
          )}
          {status === "invalid" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Ir para o login
              </Button>
            </div>
          )}
          {status === "ready" && (
            <form onSubmit={save} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Crie uma senha para entrar depois com seu e-mail. Assim você acompanha o projeto e
                atualiza as suas tarefas sempre que precisar.
              </p>
              <div className="space-y-2">
                <Label htmlFor="pw">Senha</Label>
                <Input
                  id="pw"
                  type="password"
                  minLength={6}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirmar senha</Label>
                <Input
                  id="pw2"
                  type="password"
                  minLength={6}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Salvando…" : "Criar senha e entrar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={goNext}
              >
                Agora não — entrar no portal
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
