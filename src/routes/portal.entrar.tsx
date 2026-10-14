import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalAuth } from "@/lib/portal/portal-client";
import { CORE_GRADIENT, CORE_GREEN } from "@/components/portal/PortalShell";
import coreLogo from "@/assets/core-suite-logo-horizontal.png.asset.json";
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
  const logoUrl = info.data?.projectLogo || org?.logo_url || null;
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
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Marca + projeto (identidade Core Suite) */}
      <aside
        className="flex flex-col justify-between gap-6 px-6 py-8 text-white lg:w-1/2 lg:px-12 lg:py-12"
        style={{ background: CORE_GRADIENT }}
      >
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <span className="grid h-12 place-items-center rounded-xl bg-white px-3">
              <img
                src={logoUrl}
                alt={projectName ?? org?.name ?? "Logo"}
                className="h-8 w-auto max-w-[140px] object-contain"
              />
            </span>
          ) : (
            <span
              className="grid h-12 w-12 place-items-center rounded-xl font-display text-lg font-bold"
              style={{ backgroundColor: CORE_GREEN, color: "#071A3D" }}
            >
              {(org?.name ?? "P").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <p className="text-sm font-semibold">{org?.name ?? "Portal do cliente"}</p>
            <p className="text-xs text-white/70">Portal do cliente</p>
          </div>
        </div>
        <div className="max-w-lg">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: CORE_GREEN }}
          >
            {info.data?.projectNumber ? `Projeto nº ${info.data.projectNumber}` : "Seu projeto"}
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl">
            {projectName ?? "Acompanhe seu projeto"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            Veja o roadmap, abra cada etapa e marque as tarefas que são sua responsabilidade. A
            equipe acompanha tudo em tempo real.
          </p>
          <div className="mt-8 hidden max-w-md grid-cols-3 gap-3 lg:grid">
            {[
              ["ROADMAP", "Etapas do projeto"],
              ["TAREFAS", "Marque o que concluir"],
              ["EQUIPE", "Em tempo real"],
            ].map(([tag, label]) => (
              <div
                key={tag}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 backdrop-blur-sm"
              >
                <div
                  className="text-[10px] font-semibold tracking-[0.14em]"
                  style={{ color: CORE_GREEN }}
                >
                  {tag}
                </div>
                <div className="mt-1 text-xs text-white">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="hidden text-xs text-white/40 lg:block">Acesso exclusivo do cliente.</p>
      </aside>

      {/* Formulário */}
      <main className="flex flex-1 items-start justify-center px-4 py-8 lg:items-center lg:py-12">
        <div className="w-full max-w-md">
          <form onSubmit={submit} className="space-y-4">
            <div className="pb-3">
              <h2 className="font-display text-3xl font-semibold text-foreground">Bem-vindo!</h2>
              <p className="mt-1 text-sm" style={{ color: CORE_GREEN }}>
                Acesse o portal do seu projeto.
              </p>
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
            <Button type="submit" className="w-full font-semibold" disabled={loading}>
              <Lock className="h-4 w-4" /> {loading ? "Entrando…" : "Entrar"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Use o e-mail e a senha do convite. Esqueceu a senha? Peça à equipe do projeto para
              reenviar o acesso.
            </p>
          </form>
          <div className="mt-8 flex items-center justify-center gap-2 border-t pt-5 text-[11px] text-muted-foreground">
            <span>Tecnologia</span>
            <img src={coreLogo.url} alt="Core Suite" className="h-7 w-auto object-contain" />
          </div>
        </div>
      </main>
    </div>
  );
}
