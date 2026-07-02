import {
  CheckSquare,
  FolderKanban,
  DollarSign,
  Users,
  Calendar,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type ModuleSlug =
  | "tarefas"
  | "projetos"
  | "financeiro"
  | "clientes"
  | "agenda"
  | "hub";

export interface ModuleDef {
  slug: ModuleSlug;
  name: string;
  shortName: string;
  description: string;
  route: string;
  scope: string;
  manifest: string;
  themeColor: string;
  icon: LucideIcon;
  appleIcon: string;
}

export const MODULES: ModuleDef[] = [
  {
    slug: "tarefas",
    name: "Hublynx Tarefas",
    shortName: "Tarefas",
    description: "Central de tarefas com lembretes push.",
    route: "/tarefas",
    scope: "/tarefas/",
    manifest: "/manifests/tarefas.webmanifest",
    themeColor: "#00D084",
    icon: CheckSquare,
    appleIcon: "/icons/tarefas-192.png",
  },
  {
    slug: "projetos",
    name: "Hublynx Projetos",
    shortName: "Projetos",
    description: "Projetos, entregas e roadmap.",
    route: "/projetos",
    scope: "/projetos/",
    manifest: "/manifests/projetos.webmanifest",
    themeColor: "#6366F1",
    icon: FolderKanban,
    appleIcon: "/icons/projetos-192.png",
  },
  {
    slug: "financeiro",
    name: "Hublynx Financeiro",
    shortName: "Financeiro",
    description: "Receber, pagar, DRE, previsões.",
    route: "/financeiro",
    scope: "/financeiro/",
    manifest: "/manifests/financeiro.webmanifest",
    themeColor: "#0EA5E9",
    icon: DollarSign,
    appleIcon: "/icons/financeiro-192.png",
  },
  {
    slug: "clientes",
    name: "Hublynx Clientes",
    shortName: "Clientes",
    description: "Base de clientes e CRM.",
    route: "/clientes",
    scope: "/clientes/",
    manifest: "/manifests/clientes.webmanifest",
    themeColor: "#F59E0B",
    icon: Users,
    appleIcon: "/icons/clientes-192.png",
  },
  {
    slug: "agenda",
    name: "Hublynx Agenda",
    shortName: "Agenda",
    description: "Agenda integrada com Google Calendar.",
    route: "/agenda",
    scope: "/agenda/",
    manifest: "/manifests/agenda.webmanifest",
    themeColor: "#EF4444",
    icon: Calendar,
    appleIcon: "/icons/agenda-192.png",
  },
  {
    slug: "hub",
    name: "Hublynx Hub",
    shortName: "Hub",
    description: "Painel unificado (pacote completo).",
    route: "/hub",
    scope: "/",
    manifest: "/manifest.webmanifest",
    themeColor: "#0b1220",
    icon: Sparkles,
    appleIcon: "/apple-touch-icon.png",
  },
];

export function moduleForPath(pathname: string): ModuleDef | null {
  // Longest scope wins so /tarefas/... doesn't match "/" first
  const sorted = [...MODULES].sort((a, b) => b.scope.length - a.scope.length);
  for (const m of sorted) {
    if (m.scope === "/") continue;
    if (pathname === m.route || pathname.startsWith(m.scope)) return m;
  }
  return null;
}

export function getModule(slug: ModuleSlug): ModuleDef | undefined {
  return MODULES.find((m) => m.slug === slug);
}
