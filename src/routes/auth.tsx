import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HublynxLogo } from "@/components/HublynxLogo";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar — Hublynx Core" }] }),
  component: AuthPage,
});

const FEATURES = [
  { tag: "TAREFAS", label: "Kanban + Lista" },
  { tag: "PROJETOS", label: "Andamento em %" },
  { tag: "FINANCEIRO", label: "A pagar / receber" },
  { tag: "AGENDA", label: "Reuniões e calls" },
];

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    // Listener registrado ANTES da checagem inicial de sessão.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      return toast.error(result.error.message ?? "Não foi possível entrar com o Google.");
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/dashboard" });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Você já pode entrar.");
    setTab("login");
  }

  async function handleReset() {
    if (!email) return toast.error("Informe seu e-mail para recuperar a senha.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Enviamos um link de recuperação para seu e-mail.");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel */}
      <div
        className="hidden lg:flex flex-col justify-between p-12"
        style={{ background: "linear-gradient(135deg,#071A3D 0%,#0a2557 60%,#00D084 180%)" }}
      >
        <HublynxLogo className="[&_*]:!text-white" />

        <div className="text-white max-w-lg">
          <h1 className="font-display text-4xl font-semibold leading-tight">
            O sistema operacional<br />do seu negócio.
          </h1>
          <p className="mt-4 text-white/70 text-sm leading-relaxed">
            Tarefas, projetos, clientes, financeiro e agenda em um único lugar. Substitua Trello,
            planilhas e agendas de papel.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 max-w-md">
            {FEATURES.map((f) => (
              <div
                key={f.tag}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-sm"
              >
                <div className="text-[10px] font-semibold tracking-[0.14em] text-[#00D084]">
                  {f.tag}
                </div>
                <div className="text-sm text-white mt-1">{f.label}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/40 text-xs">© 2026 Hublynx Group</p>
      </div>

      {/* Right panel */}
      <div className="flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-6 flex justify-center"><HublynxLogo /></div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-0">
              <h2 className="font-display text-3xl font-semibold text-foreground">
                Bem-vindo de volta!
              </h2>
              <p className="mt-1 text-sm text-[#00D084]">Acesse o seu Hublynx Core.</p>

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogle}
                disabled={loading}
                className="w-full mt-8 gap-2"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
                  <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
                  <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
                  <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
                </svg>
                Entrar com Google
              </Button>

              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="voce@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-xs text-[#00D084] hover:underline font-medium"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-[#00D084] hover:bg-[#00b873] text-white"
                  disabled={loading}
                >
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>

              <p className="mt-6 text-sm text-center text-muted-foreground">
                Não tem uma conta?{" "}
                <button
                  type="button"
                  onClick={() => setTab("signup")}
                  className="text-[#00D084] font-medium hover:underline"
                >
                  Criar conta
                </button>
              </p>
            </TabsContent>

            <TabsContent value="signup" className="mt-0">
              <h2 className="font-display text-3xl font-semibold text-foreground">
                Crie sua conta
              </h2>
              <p className="mt-1 text-sm text-[#00D084]">Comece a organizar seu negócio agora.</p>

              <form onSubmit={handleSignup} className="space-y-4 mt-8">
                <div className="space-y-2">
                  <Label htmlFor="fn">Nome completo</Label>
                  <Input id="fn" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">E-mail</Label>
                  <Input
                    id="email2"
                    type="email"
                    required
                    placeholder="voce@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Senha</Label>
                  <Input
                    id="password2"
                    type="password"
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-[#00D084] hover:bg-[#00b873] text-white"
                  disabled={loading}
                >
                  {loading ? "Criando..." : "Criar conta"}
                </Button>
              </form>

              <p className="mt-6 text-sm text-center text-muted-foreground">
                Já tem uma conta?{" "}
                <button
                  type="button"
                  onClick={() => setTab("login")}
                  className="text-[#00D084] font-medium hover:underline"
                >
                  Entrar
                </button>
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
