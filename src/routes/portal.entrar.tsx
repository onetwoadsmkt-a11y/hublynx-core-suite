import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalAuth } from "@/lib/portal/portal-client";
import { portalMyProjects, portalPublicInfo } from "@/lib/portal/portal.functions";

/** Login próprio do portal do cliente (não usa nem mexe no login do Core). */
export const Route = createFileRoute("/portal/entrar")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar — Portal do cliente" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    p: typeof s.p === "string" && /^[a-z0-9-]{1,160}$/i.test(s.p) ? s.p : undefined,
    e: typeof s.e === "string" && s.e.length <= 200 ? s.e : undefined,
  }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const { p, e } = Route.useSearch();
  const infoFn = useServerFn(portalPublicInfo);
  const listFn = useServerFn(portalMyProjects);
  const info = useQuery({
    queryKey: ["portal-public", p],
    queryFn: () => infoFn({ data: { projectRef: p! } }),
    enabled: !!p,
    staleTime: 5 * 60_000,
  });
  const [email, setEmail] = useState(e ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const org = info.data?.organization ?? null;
  const color = org?.brand_color || "#0f2b4c";
  const projectName = info.data?.projectName ?? null;

  async function enter(token: string) {
    // Confere se a conta tem projeto no portal antes de entrar.
    const projects = await listFn({ data: { token } });
    if (!projects.length) {
      await portalAuth().auth.signOut();
      setError(
        "Esta conta não tem nenhum projeto liberado no portal. Use o e-mail e a senha que vieram no convite.",
      );
      return;
    }
    const target =
      (p && projects.find((x) => x.slug === p || x.id === p)) ||
      (projects.length === 1 ? projects[0] : null);
    window.location.replace(target ? `/portal/${target.slug || target.id}` : "/portal");
  }

  // Já tem sessão do portal: entra direto.
  useEffect(() => {
    portalAuth()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) enter(data.session.access_token).catch(() => null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: err } = await portalAuth().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password.trim(),
    });
    if (err || !data.session) {
      setLoading(false);
      setError(
        /invalid/i.test(err?.message ?? "")
          ? "E-mail ou senha incorretos. Confira a senha do convite mais recente (cada reenvio gera uma senha nova)."
          : (err?.message ?? "Não foi possível entrar."),
      );
      return;
    }
    try {
      await enter(data.session.access_token);
    } catch (x) {
      setError((x as Error).message || "Não foi possível abrir o portal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 lg:flex-row">
      {/* Marca + projeto */}
      <aside
        className="flex flex-col justify-between gap-6 px-6 py-8 text-white lg:w-[44%] lg:px-12 lg:py-14"
        style={{ backgroundColor: color }}
      >
        <div className="flex items-center gap-3">
          {org?.logo_url ? (
            <span className="grid h-12 place-items-center rounded-xl bg-white px-3">
              <img
                src={org.logo_url}
                alt={org.name}
                className="h-8 w-auto max-w-[140px] object-contain"
              />
            </span>
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 text-lg font-bold">
              {(org?.name ?? "P").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <p className="text-sm font-semibold">{org?.name ?? "Portal do cliente"}</p>
            <p className="text-xs text-white/70">Portal do cliente</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">
            {info.data?.projectNumber ? `Projeto nº ${info.data.projectNumber}` : "Seu projeto"}
          </p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl">
            {projectName ?? "Acompanhe seu projeto"}
          </h1>
          <p className="mt-3 max-w-md text-sm text-white/80">
            Veja o roadmap, abra cada etapa e marque as tarefas que são sua responsabilidade. A
            equipe acompanha tudo em tempo real.
          </p>
        </div>
        <p className="hidden text-xs text-white/60 lg:block">Acesso exclusivo do cliente.</p>
      </aside>

      {/* Formulário */}
      <main className="flex flex-1 items-start justify-center px-4 py-8 lg:items-center lg:py-14">
        <form
          onSubmit={submit}
          className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Entrar no portal</h2>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pe">E-mail</Label>
            <Input
              id="pe"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(x) => setEmail(x.target.value)}
              placeholder="seu@email.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp">Senha</Label>
            <div className="relative">
              <Input
                id="pp"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(x) => setPassword(x.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full text-white"
            style={{ backgroundColor: color }}
            disabled={loading}
          >
            {loading ? "Entrando…" : "Entrar"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Use o e-mail e a senha do convite. Esqueceu a senha? Peça à equipe do projeto para
            reenviar o acesso.
          </p>
        </form>
      </main>
    </div>
  );
}
