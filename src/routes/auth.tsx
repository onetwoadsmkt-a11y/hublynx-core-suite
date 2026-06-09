import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

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

              <form onSubmit={handleLogin} className="space-y-4 mt-8">
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
