import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rememberNext } from "@/lib/auth-redirect";
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

/** Garante sessão; sem login, manda para a tela de entrar. */
export function usePortalSession() {
  const navigate = useNavigate();
  const [state, setState] = useState<{ ready: boolean; email: string | null; name: string | null }>(
    {
      ready: false,
      email: null,
      name: null,
    },
  );
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (!data.session) {
        // depois do login, volta para o projeto que o cliente abriu
        rememberNext(window.location.pathname);
        navigate({ to: "/auth", replace: true });
        return;
      }
      const u = data.session.user;
      setState({
        ready: true,
        email: u.email ?? null,
        name: (u.user_metadata?.full_name as string | undefined) ?? null,
      });
    });
    return () => {
      alive = false;
    };
  }, [navigate]);
  return state;
}

export function PortalShell({
  brand,
  email,
  children,
}: {
  brand?: { name: string; logo_url: string | null; brand_color: string | null } | null;
  email?: string | null;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const color = brand?.brand_color || "#0f2b4c";
  const [pwOpen, setPwOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setTempPassword(data.user?.user_metadata?.temp_password === true);
    });
  }, []);
  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen bg-muted/30">
      <header
        className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur"
        style={{ borderTop: `3px solid ${color}` }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/portal" className="flex min-w-0 items-center gap-3">
            {brand?.logo_url ? (
              <img
                src={brand.logo_url}
                alt={brand.name}
                className="h-8 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {(brand?.name ?? "P").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{brand?.name ?? "Portal do cliente"}</p>
              <p className="text-[11px] text-muted-foreground">Portal do cliente</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {email && (
              <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
            )}
            <Button variant="ghost" size="sm" onClick={() => setPwOpen(true)}>
              <KeyRound className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Alterar senha</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>
      {tempPassword && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-900">
            <span>Você está usando a senha enviada no convite. Crie uma senha sua.</span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setPwOpen(true)}>
              Alterar senha
            </Button>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <ChangePasswordDialog
        open={pwOpen}
        onOpenChange={setPwOpen}
        onDone={() => setTempPassword(false)}
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
    const { error } = await supabase.auth.updateUser({
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
