import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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
        try {
          sessionStorage.setItem("portal_next", window.location.pathname);
        } catch {
          /* sem storage */
        }
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
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
