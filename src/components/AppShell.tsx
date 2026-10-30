import { ChangePasswordDialog } from "@/components/security/ChangePasswordDialog";
import { type ReactNode, useState, useEffect } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, CheckSquare, FolderKanban, Users,
  Calendar, BarChart3, Settings, Search, LogOut, ChevronDown,
  PanelLeftClose, PanelLeftOpen, Shield, Lock, Filter, MessageSquare, Building2, FileText,
} from "lucide-react";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeToggle } from "./ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { HublynxLogo } from "./HublynxLogo";
import { clearBrandCache, useWorkspace } from "@/hooks/useWorkspace";
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
import { useValuesUnlocked } from "@/lib/security/value-lock";
import { ValuesLockToggle } from "@/components/security/ValuesLockToggle";
import { useAccess } from "@/hooks/useAccess";
import { capabilityForPath } from "@/lib/subscriptions/capabilities";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { isProjectOnlyAccess, orgModuleForPath } from "@/lib/org/modules-map";
import { useMyTasks } from "@/hooks/useMyTasks";
import { runTaskNotificationsNow } from "@/lib/tasks/my-tasks.functions";
import { ClipboardList, KeyRound } from "lucide-react";
import { CreditCard } from "lucide-react";
import { WorkspaceSwitcher } from "@/components/workspaces/WorkspaceSwitcher";
import { PriorityAlertModal, usePriorityAlerts } from "@/components/tasks/PriorityAlerts";
import { LeadCardHost } from "@/components/pipeline/LeadCardHost";
import { AlertTriangle } from "lucide-react";

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

// CRM enxuto: a jornada é lead → cliente → projeto. O Financeiro saiu do app.
const NAV_GROUPS: NavGroup[] = [
  {
    section: "CRM",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/pipeline", label: "Pipeline", icon: Filter },
      { to: "/leads", label: "Leads", icon: Users, moduleSlug: "clientes" },
      { to: "/formularios", label: "Formulários", icon: FileText },
      { to: "/tarefas", label: "Agenda", icon: Calendar, moduleSlug: "tarefas" },
      { to: "/atendimento", label: "Atendimento", icon: MessageSquare },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
      { to: "/clientes", label: "Clientes", icon: Building2 },
      { to: "/projetos", label: "Projetos", icon: FolderKanban, moduleSlug: "projetos" },
    ],
  },
  {
    section: "Administração",
    items: [{ to: "/configuracoes", label: "Configurações", icon: Settings }],
  },
];

function SidebarNav({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const prioritySearch = useRouterState({ select: (s) => (s.location.search as { prioridade?: number }).prioridade });
  const { isAdmin } = useIsAdmin();
  const { count: priorityCount } = usePriorityAlerts();
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
  const projectOnly = isProjectOnlyAccess(org);
  const mine = useMyTasks(!org.isLoading && !!org.activeOrg);
  const myBadge = mine.late + mine.today;
  if (org.isLoading) {
    return (
      <nav className={`flex flex-col gap-2 ${collapsed ? "px-2" : "px-3"} py-4`} aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg bg-muted/60 animate-pulse" />
        ))}
      </nav>
    );
  }
  if (org.isError) return <div className="p-4 text-sm text-nav-label-fixed"><p>Falha ao carregar acesso.</p><Button variant="ghost" onClick={org.retryAccess}>Tentar novamente</Button></div>;
  if (!org.isSuperAdmin && !org.activeOrg) return <p className="p-4 text-sm text-nav-label-fixed">Aguardando liberação de acesso</p>;
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
        // equipe de projeto: só Projetos
        if (projectOnly) return item.to === "/projetos";
        // Módulos contratados pela empresa ativa mandam: se a empresa tem o módulo,
        // o item aparece; se não tem, fica oculto.
        const mod = orgModuleForPath(item.to);
        if (mod) return org.hasModule(mod);
        if (isAdmin) return true;
        const cap = capabilityForPath(item.to);
        return !cap || Boolean(org.activeOrg);
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
                <span className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-nav-label-fixed">
                  {group.section}
                </span>
              ))}
            {group.items.map((item) => {
              // Agenda: Lista/Kanban (/tarefas) e calendário (/agenda) acendem o mesmo item.
              const active =
                pathname === item.to || pathname.startsWith(item.to + "/") ||
                (item.to === "/tarefas" && (pathname === "/agenda" || pathname.startsWith("/agenda/")));
              const Icon = item.icon;
              const slug = item.moduleSlug;
              const row = slug ? modules?.find((r) => r.module_slug === slug) : undefined;
              const disabled = slug && row ? !row.enabled : false;
              const isTasks = item.to === "/tarefas";
              const badge = isTasks && priorityCount > 0 ? priorityCount : 0;
              const link = (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={`relative flex items-center gap-3 rounded-lg ${collapsed ? "justify-center px-2" : "px-3"} py-2 text-sm font-medium text-nav-label-fixed transition-colors ${
                    active && !(isTasks && prioritySearch)
                      ? "bg-primary/10"
                      : "hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {collapsed && badge > 0 && (
                    <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-sidebar" aria-label={`${badge} prioritárias`} />
                  )}
                  {!collapsed && (
                    <span className="flex-1 flex items-center justify-between gap-2">
                      {item.label}
                      {badge > 0 && (
                        <span className="min-w-[20px] rounded-full bg-destructive px-1.5 text-center text-[11px] font-bold leading-5 text-destructive-foreground" aria-label={`${badge} tarefas prioritárias`}>
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                      {disabled && <Lock className="h-3 w-3 opacity-60" />}
                    </span>
                  )}
                </Link>
              );
              // "Minhas tarefas" (designadas a mim): abaixo de Prioridade na Agenda;
              // em Projetos quando a pessoa não tem a Agenda.
              const hasAgenda = org.hasModule("tasks") && !projectOnly;
              const showMine = !collapsed && ((isTasks && hasAgenda) || (item.to === "/projetos" && !hasAgenda));
              const mineLink = showMine && (
                <Link
                  key="/minhas-tarefas"
                  to={"/minhas-tarefas" as any}
                  onClick={onNavigate}
                  className={`ml-7 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium text-nav-label-fixed transition-colors ${
                    pathname === "/minhas-tarefas" ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <ClipboardList className={`h-3.5 w-3.5 shrink-0 ${mine.late > 0 ? "text-destructive" : ""}`} />
                  <span className="flex-1">Minhas tarefas</span>
                  {myBadge > 0 ? (
                    <span className={`min-w-[18px] rounded-full px-1.5 text-center text-[11px] font-bold leading-[18px] tabular-nums ${mine.late > 0 ? "bg-destructive text-destructive-foreground" : "bg-amber-400 text-amber-950"}`}>
                      {myBadge > 99 ? "99+" : myBadge}
                    </span>
                  ) : mine.open > 0 ? (
                    <span className="text-[11px] tabular-nums text-muted-foreground">{mine.open}</span>
                  ) : null}
                </Link>
              );
              // Submenu "Prioridade" logo abaixo de Tarefas.
              const sub = isTasks && !collapsed && (
                <Link
                  key="/tarefas?prioridade"
                  to="/tarefas"
                  search={{ prioridade: 1 } as any}
                  onClick={onNavigate}
                  className={`ml-7 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium text-nav-label-fixed transition-colors ${
                    active && prioritySearch ? "bg-destructive/10" : "hover:bg-muted"
                  }`}
                >
                  <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${badge > 0 ? "text-destructive" : ""}`} />
                  <span className="flex-1">Prioridade</span>
                  {badge > 0 && <span className="text-[11px] font-bold text-destructive tabular-nums">{badge > 99 ? "99+" : badge}</span>}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">
                    {item.label}{disabled ? " (inativo)" : ""}{badge > 0 ? ` · ${badge} prioritária${badge === 1 ? "" : "s"}` : ""}
                  </TooltipContent>
                </Tooltip>
              ) : sub || mineLink ? (
                <div key={item.to} className="flex flex-col gap-0.5">{link}{sub}{mineLink}</div>
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
  const org = useOrgAccess();
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
        mustChangePassword: (u.user.user_metadata as Record<string, unknown> | undefined)?.must_change_password === true,
        ...p,
        full_name: p?.full_name || meta.full_name || meta.name || u.user.email,
        avatar_url: p?.avatar_url || meta.avatar_url || meta.picture || null,
      };
    },
  });

  const [pwOpen, setPwOpen] = useState(false);
  async function handleLogout() {
    await qc.cancelQueries();
    qc.clear();
    clearBrandCache();
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
            <span className="text-xs text-muted-foreground">{org.isSuperAdmin ? "Administrador da plataforma" : org.role === "org_admin" ? "Administrador da empresa" : org.role === "guest" ? "Convidado" : "Usuário"}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{data?.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to="/configuracoes">Configurações</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setPwOpen(true)}>
          <KeyRound className="h-4 w-4 mr-2" /> Alterar senha
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} className="text-destructive">
          <LogOut className="h-4 w-4 mr-2" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
      {/* conta nova com senha provisória: cria a senha antes de usar o Core */}
      <ChangePasswordDialog open={!!data?.mustChangePassword} onOpenChange={() => {}} forced />
    </DropdownMenu>
  );
}

/**
 * Com o Core aberto, dispara os avisos de tarefas da empresa (e-mail ao designar e
 * resumo diário) no máximo a cada 10 min por navegador. O agendamento do servidor
 * (rota de automações) faz o mesmo mesmo com tudo fechado.
 */
function TaskNotificationsRunner() {
  const org = useOrgAccess();
  const runFn = useServerFn(runTaskNotificationsNow);
  const orgId = org.activeOrg?.id;
  useEffect(() => {
    if (!orgId) return;
    const key = `core_task_notify_${orgId}`;
    const tick = () => {
      let last = 0;
      try { last = Number(localStorage.getItem(key) ?? 0); } catch { /* sem armazenamento */ }
      if (Date.now() - last < 10 * 60_000) return;
      try { localStorage.setItem(key, String(Date.now())); } catch { /* sem armazenamento */ }
      runFn({ data: { organizationId: orgId } }).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 5 * 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);
  return null;
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
    <div className="h-screen flex w-full bg-app-bg overflow-hidden">
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
          <div className="sm:hidden">
            <HublynxLogo collapsed />
          </div>

          <div className="relative hidden max-w-xl flex-1 sm:block">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar tarefas, projetos, clientes..." className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background" />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <WorkspaceSwitcher />
            <HeaderInstallModule />
            <ValuesLockToggle />
            <ThemeToggle />
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>

        <SupportBanner />
        <main className="flex-1 overflow-y-auto">
          <div key={valuesUnlocked ? "unlocked" : "locked"} className="p-4 lg:p-8 max-w-[1600px] mx-auto w-full">
            {children}
          </div>
          <footer className="px-4 lg:px-8 pb-6 pt-2 text-center text-[11px] text-muted-foreground/70">
            HubLynx Core Suite · Todos os direitos reservados
          </footer>
        </main>
        <TaskNotificationsRunner />
      <PriorityAlertModal />
        <LeadCardHost />
      </div>
    </div>
  );
}

/** Administrador da Hublynx atendendo um assinante: deixa claro de quem são os dados na tela. */
function SupportBanner() {
  const { activeOrganization, organizations, setActiveOrganization } = useWorkspace();
  if (!activeOrganization?.support) return null;
  const own = organizations.find((o) => !o.support);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 lg:px-6">
      <span>
        <strong>Modo suporte:</strong> você está vendo somente os dados de <strong>{activeOrganization.name}</strong>.
      </span>
      {own && (
        <button
          type="button"
          onClick={() => setActiveOrganization(own.id)}
          className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-bold hover:bg-amber-100"
        >
          Voltar para {own.name}
        </button>
      )}
    </div>
  );
}
