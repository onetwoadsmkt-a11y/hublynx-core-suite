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
import { brandVars, HEX_RE, readableOn } from "@/components/BrandTheme";

export type PortalBrand = { name: string; logo_url: string | null; brand_color: string | null };

/** Identidade visual do Core Suite (mesma da tela de login do Core). */
export const CORE_NAVY = "#0a2557";
export const CORE_GREEN = "#00D084";
export const CORE_GRADIENT = "linear-gradient(135deg,#071A3D 0%,#0a2557 60%,#00D084 180%)";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Cores da empresa dentro do portal (mesma regra do Core): troca só as cores de
 * destaque (botões, etapa atual, progresso). Verde continua sendo "concluído".
 * Sem cor cadastrada, fica a identidade do Core Suite.
 */
function usePortalBrandColors(hex: string | null) {
  useIsoLayoutEffect(() => {
    if (typeof document === "undefined" || !hex) return;
    const root = document.documentElement;
    const vars = brandVars(hex);
    const keys = Object.keys(vars) as (keyof typeof vars)[];
    keys.forEach((k) => root.style.setProperty(k, vars[k]));
    return () => keys.forEach((k) => root.style.removeProperty(k));
  }, [hex]);
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
  usePortalBrandColors(hex);
  // texto do cabeçalho legível sobre a cor da empresa (escuro em cores claras)
  const lightBrand = hex ? readableOn(hex) !== "oklch(1 0 0)" : false;
  const headerStyle = hex
    ? {
        background: `linear-gradient(135deg, ${hex} 0%, color-mix(in oklab, ${hex} 80%, black) 100%)`,
        color: lightBrand ? "#071A3D" : "#ffffff",
        borderBottomColor: `color-mix(in oklab, ${hex} 65%, black)`,
      }
    : { background: CORE_GRADIENT, color: "#ffffff", borderBottomColor: CORE_GREEN };
  const headerBtn = lightBrand
    ? "text-inherit hover:bg-black/10 hover:text-inherit"
    : "text-inherit hover:bg-white/15 hover:text-inherit";
  const [pwOpen, setPwOpen] = useState(false);
  async function signOut() {
    await portalAuth().auth.signOut();
    window.location.replace(portalLoginPath(projectRef, session.email));
  }
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b-2 shadow-sm" style={headerStyle}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/portal" className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              <span className="grid h-10 shrink-0 place-items-center rounded-lg bg-white px-2">
                <img
                  src={logoUrl}
                  alt={title ?? brand?.name ?? "Logo"}
                  className="h-7 w-auto max-w-[110px] object-contain"
                />
              </span>
            ) : (
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg font-display text-base font-bold"
                style={
                  hex
                    ? { backgroundColor: "rgba(255,255,255,0.92)", color: "#071A3D" }
                    : { backgroundColor: CORE_GREEN, color: "#071A3D" }
                }
              >
                {(brand?.name ?? "P").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 font-display text-[15px] font-semibold leading-tight sm:truncate sm:text-lg">
                {title || brand?.name || "Portal do cliente"}
              </p>
              <p className="truncate text-xs opacity-75">
                {subtitle ??
                  (brand?.name ? `${brand.name} · Portal do cliente` : "Portal do cliente")}
              </p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            {session.email && (
              <span className="mr-1 hidden text-xs opacity-75 lg:inline">{session.email}</span>
            )}
            <Button variant="ghost" size="sm" className={headerBtn} onClick={() => setPwOpen(true)}>
              <KeyRound className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Alterar senha</span>
            </Button>
            <Button variant="ghost" size="sm" className={headerBtn} onClick={signOut}>
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
      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-6">{children}</main>
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
