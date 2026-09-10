import { type ReactNode, useState, useEffect } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, CheckSquare, FolderKanban, Users,
  Calendar, FolderArchive, BarChart3, Settings, Search, LogOut, ChevronDown,
  PanelLeftClose, PanelLeftOpen, Shield, Sparkles, Lock, Filter, MessageSquare, Building2, Wallet,
} from "lucide-react";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeToggle } from "./ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { HublynxLogo } from "./HublynxLogo";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { listUserModules } from "@/lib/modules/modules.functions";
import { moduleForPath, type ModuleSlug } from "@/lib/modules/registry";
import { InstallModuleButton } from "@/components/modules/InstallModuleButton";
import { useValuesUnlocked, lockValues } from "@/lib/security/value-lock";
import { useAccess } from "@/hooks/useAccess";
import { capabilityForPath } from "@/lib/subscriptions/capabilities";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { orgModuleForPath } from "@/lib/org/modules-map";
import { CreditCard } from "lucide-react";
import { WorkspaceSwitcher } from "@/components/workspaces/WorkspaceSwitcher";

function HeaderInstallModule() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mod = moduleForPath(pathname);
  if (!mod) return null;
  return <div className="hidden md:block"><InstallModuleButton module={mod} /></div>;
}

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  moduleSlug?: ModuleSlug;
};

type NavGroup = { section?: string; items: NavItem[] };

// Financeiro segue existindo (rotas /financeiro/*), apenas oculto do menu.
const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { to: "/hub", label: "Hub Central", icon: Sparkles, moduleSlug: "hub" },
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    section: "Comercial",
    items: [
      { to: "/comercial/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/pipeline", label: "Pipeline de Vendas", icon: Filter },
      { to: "/clientes", label: "LEADS", icon: Users, moduleSlug: "clientes" },
      { to: "/atendimento", label: "Atendimento", icon: MessageSquare },
      { to: "/comercial/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    section: "Operação & Gestão",
    items: [
      { to: "/tarefas", label: "Tarefas", icon: CheckSquare, moduleSlug: "tarefas" },
      { to: "/projetos", label: "Projetos", icon: FolderKanban, moduleSlug: "projetos" },
      { to: "/agenda", label: "Agenda", icon: Calendar, moduleSlug: "agenda" },
      { to: "/arquivos", label: "Arquivos", icon: FolderArchive },
      { to: "/gestao/clientes", label: "Clientes", icon: Building2 },
      { to: "/financeiro", label: "Financeiro", icon: Wallet },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },


  {
    section: "Administração",
    items: [{ to: "/configuracoes", label: "Configurações", icon: Settings }],
  },
];

function SidebarNav({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useIsAdmin();
  const valuesUnlocked = useValuesUnlocked();
  const listMods = useServerFn(listUserModules);
  const { data: modules } = useQuery({
    queryKey: ["user-modules"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.access_token) return [];
      return listMods();
    },
    staleTime: 60_000,
    retry: false,
  });
  const { can } = useAccess();
  const org = useOrgAccess();
  if (org.isLoading) {
    return (
      <nav className={`flex flex-col gap-2 ${collapsed ? "px-2" : "px-3"} py-4`} aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg bg-muted/60 animate-pulse" />
        ))}
      </nav>
    );
  }
  const groups: NavGroup[] = NAV_GROUPS.map((g) =>
    g.section === "Administração" && isAdmin
      ? {
          ...g,
          items: [
            ...g.items,
            { to: "/admin", label: "Central Administrativa", icon: Shield },
            { to: "/admin/assinaturas", label: "Assinaturas (Admin)", icon: CreditCard },
            { to: "/admin/usuarios", label: "Usuários (Admin)", icon: Shield },
          ],
        }
      : g,
  )
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        // Módulos contratados pela empresa ativa (Financeiro fica oculto para quem não tem).
        const mod = orgModuleForPath(item.to);
        if (mod && !org.hasModule(mod)) return false;
        if (isAdmin) return true;
        const cap = capabilityForPath(item.to);
        return !cap || can(cap);
      }),
    }))
    .filter((g) => g.items.length > 0);
  return (
    <TooltipProvider delayDuration={0}>
      <nav className={`flex flex-col gap-1 ${collapsed ? "px-2" : "px-3"} py-2`}>
        {groups.map((group, gi) => (
          <div key={group.section ?? `g-${gi}`} className="flex flex-col gap-1">
            {group.section &&
              (collapsed ? (
                <div className="mx-2 my-2 border-t" />
              ) : (
                <span className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.section}
                </span>
              ))}
            {group.items.map((item) => {
              const active = pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              const slug = item.moduleSlug;
              const row = slug ? modules?.find((r) => r.module_slug === slug) : undefined;
              const disabled = slug && row ? !row.enabled : false;
              const locked = item.to === "/financeiro" && !valuesUnlocked;
              const link = (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 rounded-lg ${collapsed ? "justify-center px-2" : "px-3"} py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : disabled
                        ? "text-muted-foreground/60 hover:bg-muted"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 flex items-center justify-between">
                      {item.label}
                      {(disabled || locked) && <Lock className="h-3 w-3 opacity-60" />}
                    </span>
                  )}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}{disabled ? " (inativo)" : ""}</TooltipContent>
                </Tooltip>
              ) : (
                link
              );
            })}
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: p } = await supabase.from("profiles").select("full_name,avatar_url,company").eq("id", u.user.id).maybeSingle();
      const meta = (u.user.user_metadata ?? {}) as Record<string, string | undefined>;
      return {
        email: u.user.email,
        ...p,
        full_name: p?.full_name || meta.full_name || meta.name || u.user.email,
        avatar_url: p?.avatar_url || meta.avatar_url || meta.picture || null,
      };
    },
  });

  async function handleLogout() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const name = data?.full_name || data?.email || "Usuário";
  const initials = name.split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted transition-colors">
          <Avatar className="h-8 w-8">
            {data?.avatar_url ? <AvatarImage src={data.avatar_url} alt={name} referrerPolicy="no-referrer" /> : null}
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden md:flex flex-col items-start leading-tight">
            <span className="text-sm font-medium">{data?.full_name ?? "..."}</span>
            <span className="text-xs text-muted-foreground">Administrador</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{data?.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to="/configuracoes">Configurações</Link></DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} className="text-destructive">
          <LogOut className="h-4 w-4 mr-2" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const valuesUnlocked = useValuesUnlocked();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "1";
  });

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="h-screen flex w-full bg-muted/30 overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r bg-sidebar shrink-0 transition-[width] duration-200 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <div className={`h-16 flex items-center border-b ${collapsed ? "justify-center px-2" : "justify-between px-3"}`}>
          {!collapsed && (
            <div className="pl-2">
              <HublynxLogo />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? (
              <HublynxLogo collapsed />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <SidebarNav collapsed={collapsed} />
        </div>
        {collapsed && (
          <div className="p-2 border-t flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCollapsed(false)}
              aria-label="Expandir menu"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-background flex items-center gap-3 px-4 lg:px-6 shrink-0">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="h-16 flex items-center px-5 border-b"><HublynxLogo /></div>
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="relative flex-1 max-w-xl">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar tarefas, projetos, clientes..." className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background" />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <WorkspaceSwitcher />
            <HeaderInstallModule />
            {valuesUnlocked && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => lockValues()}
                aria-label="Bloquear valores"
                title="Bloquear valores"
              >
                <Lock className="h-4 w-4" />
              </Button>
            )}
            <ThemeToggle />
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div key={valuesUnlocked ? "unlocked" : "locked"} className="p-4 lg:p-8 max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
