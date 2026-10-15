import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { portalAuth, portalLoginPath, portalToken } from "@/lib/portal/portal-client";
import { PORTAL_AUTH_ERROR } from "@/lib/portal/portal.functions";
import { brandVars, HEX_RE } from "@/components/BrandTheme";
import { extractLogoPalette } from "@/lib/portal/logo-palette";
import { PortalInstallButton, usePortalPwa } from "@/components/portal/PortalPwa";

export type PortalBrand = { name: string; logo_url: string | null; brand_color: string | null };

/** Identidade visual do Core Suite (mesma da tela de login do Core). */
export const CORE_NAVY = "#0a2557";
export const CORE_GREEN = "#00D084";
export const CORE_GRADIENT = "linear-gradient(135deg,#071A3D 0%,#0a2557 60%,#00D084 180%)";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Cores da empresa dentro do portal: tiradas do logo (cor viva = destaque,
 * cor escura = títulos). Sem logo legível, usa a cor cadastrada; sem nenhuma,
 * a identidade do Core Suite. Verde continua sendo "concluído".
 */
function usePortalPalette(logoUrl: string | null, fallback: string | null) {
  const [pal, setPal] = useState<{ primary: string | null; ink: string | null }>({
    primary: fallback,
    ink: null,
  });
  useEffect(() => {
    let alive = true;
    setPal({ primary: fallback, ink: null });
    if (logoUrl) {
      extractLogoPalette(logoUrl).then((p) => {
        if (!alive) return;
        setPal({ primary: p.primary ?? fallback, ink: p.ink || null });
      });
    }
    return () => {
      alive = false;
    };
  }, [logoUrl, fallback]);

  const primary = pal.primary && HEX_RE.test(pal.primary) ? pal.primary : null;
  const ink = pal.ink && HEX_RE.test(pal.ink) ? pal.ink : null;
  useIsoLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const vars: Record<string, string> = primary ? { ...brandVars(primary) } : {};
    vars["--brand-ink"] =
      ink ?? (primary ? `color-mix(in oklab, ${primary} 22%, #0b1220)` : CORE_NAVY);
    vars["--portal-bg"] = `color-mix(in oklab, ${primary ?? CORE_GREEN} 5%, #f6f7f9)`;
    const keys = Object.keys(vars);
    keys.forEach((k) => root.style.setProperty(k, vars[k]));
    return () => keys.forEach((k) => root.style.removeProperty(k));
  }, [primary, ink]);
  return { primary, ink };
}

type SessionState = {
  ready: boolean;
  email: string | null;
  name: string | null;
  tempPassword: boolean;
};

/**
 * Sessão do portal (separada do Core). Sem sessão, manda para a tela de entrada
 * do portal e volta para o projeto depois.
 */
export function usePortalSession(projectRef?: string | null) {
  const [state, setState] = useState<SessionState>({
    ready: false,
    email: null,
    name: null,
    tempPassword: false,
  });
  useEffect(() => {
    let alive = true;
    portalAuth()
      .auth.getSession()
      .then(({ data }) => {
        if (!alive) return;
        if (!data.session) {
          window.location.replace(portalLoginPath(projectRef));
          return;
        }
        const u = data.session.user;
        setState({
          ready: true,
          email: u.email ?? null,
          name: (u.user_metadata?.full_name as string | undefined) ?? null,
          tempPassword: u.user_metadata?.temp_password === true,
        });
      });
    return () => {
      alive = false;
    };
  }, [projectRef]);

  /** Chama uma função do portal com o token da sessão; sessão vencida → tela de entrada. */
  const call = useCallback(
    async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
      const token = await portalToken();
      if (!token) {
        window.location.replace(portalLoginPath(projectRef));
        throw new Error("Entre novamente no portal.");
      }
      try {
        return await fn(token);
      } catch (err) {
        if (String((err as Error)?.message).includes(PORTAL_AUTH_ERROR)) {
          await portalAuth().auth.signOut();
          window.location.replace(portalLoginPath(projectRef, state.email));
          throw new Error("Sua sessão expirou. Entre novamente.");
        }
        throw err;
      }
    },
    [projectRef, state.email],
  );

  return {
    ...state,
    call,
    setTempPassword: (v: boolean) => setState((s) => ({ ...s, tempPassword: v })),
  };
}

export function PortalShell({
  brand,
  logo,
  title,
  subtitle,
  session,
  projectRef,
  children,
}: {
  brand?: PortalBrand | null;
  /** logo do projeto (se não houver, usa a da empresa) */
  logo?: string | null;
  /** nome do projeto no cabeçalho */
  title?: string | null;
  subtitle?: string | null;
  session: ReturnType<typeof usePortalSession>;
  projectRef?: string | null;
  children: ReactNode;
}) {
  const logoUrl = logo || brand?.logo_url || null;
  const hex = brand?.brand_color && HEX_RE.test(brand.brand_color) ? brand.brand_color : null;
  // paleta do logo da empresa (o logo do projeto é só imagem)
  usePortalPalette(brand?.logo_url ?? null, hex);
  // app (PWA) do portal deste projeto, separado do Core
  usePortalPwa(projectRef, "#ffffff");
  const [pwOpen, setPwOpen] = useState(false);
  async function signOut() {
    await portalAuth().auth.signOut();
    window.location.replace(portalLoginPath(projectRef, session.email));
  }
  return (
    <div className="min-h-screen" style={{ background: "var(--portal-bg, #f6f7f9)" }}>
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/85 backdrop-blur-md dark:bg-background/85">
        <div
          className="h-1 w-full"
          style={{ background: "linear-gradient(90deg, var(--primary), var(--brand-ink))" }}
        />
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/portal" className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={title ?? brand?.name ?? "Logo"}
                className="h-9 w-auto max-w-[120px] shrink-0 object-contain"
              />
            ) : (
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-base font-bold"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                {(brand?.name ?? "P").slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="hidden h-8 w-px shrink-0 bg-black/10 sm:block" aria-hidden />
            <div className="min-w-0">
              <p
                className="line-clamp-2 font-display text-[15px] font-semibold leading-tight sm:truncate sm:text-lg"
                style={{ color: "var(--brand-ink)" }}
              >
                {title || brand?.name || "Portal do cliente"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {subtitle ??
                  (brand?.name ? `${brand.name} · Portal do cliente` : "Portal do cliente")}
              </p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            {session.email && (
              <span className="mr-2 hidden text-xs text-muted-foreground lg:inline">
                {session.email}
              </span>
            )}
            <PortalInstallButton />
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-muted-foreground hover:text-foreground"
              onClick={() => setPwOpen(true)}
            >
              <KeyRound className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Alterar senha</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-muted-foreground hover:text-foreground"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>
      {session.tempPassword && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-900">
            <span>Você está usando a senha do convite. Crie uma senha sua.</span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setPwOpen(true)}>
              Alterar senha
            </Button>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <ChangePasswordDialog
        open={pwOpen}
        onOpenChange={setPwOpen}
        onDone={() => session.setTempPassword(false)}
      />
    </div>
  );
}

function ChangePasswordDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("A senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirm) return toast.error("As senhas não conferem.");
    setSaving(true);
    const { error } = await portalAuth().auth.updateUser({
      password,
      data: { temp_password: false },
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Senha alterada.");
    setPassword("");
    setConfirm("");
    onDone();
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Alterar senha</DialogTitle>
          <DialogDescription>Use esta senha nos próximos acessos ao portal.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="np">Nova senha</Label>
            <Input
              id="np"
              type="password"
              minLength={6}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np2">Confirmar nova senha</Label>
            <Input
              id="np2"
              type="password"
              minLength={6}
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar senha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
