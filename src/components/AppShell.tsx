import { type ReactNode, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, CheckSquare, FolderKanban, Users, DollarSign,
  Calendar, FolderArchive, BarChart3, Settings, Search, Bell, LogOut, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HublynxLogo } from "./HublynxLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { to: "/projetos", label: "Projetos", icon: FolderKanban },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/financeiro", label: "Financeiro", icon: DollarSign },
  { to: "/agenda", label: "Agenda", icon: Calendar },
  { to: "/arquivos", label: "Arquivos", icon: FolderArchive },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {NAV.map((item) => {
        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
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
      return { email: u.user.email, ...p };
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
          <Avatar className="h-8 w-8"><AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback></Avatar>
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
  return (
    <div className="min-h-screen flex w-full bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r bg-sidebar shrink-0">
        <div className="h-16 flex items-center px-5 border-b">
          <HublynxLogo />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <SidebarNav />
        </div>
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
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
            </Button>
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-8 max-w-[1600px] mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
