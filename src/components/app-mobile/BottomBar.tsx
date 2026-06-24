import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ListTodo, Plus, FolderKanban, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onNewClick: () => void;
}

export function BottomBar({ onNewClick }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/app/hoje", label: "Hoje", icon: Home },
    { to: "/app/tarefas", label: "Tarefas", icon: ListTodo },
    { to: "/app/projetos", label: "Projetos", icon: FolderKanban },
    { to: "/app/mais", label: "Mais", icon: MoreHorizontal },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-lg grid grid-cols-5 items-end px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.slice(0, 2).map((it) => (
          <BarItem key={it.to} {...it} active={pathname.startsWith(it.to)} />
        ))}
        <div className="flex justify-center -mt-7">
          <button
            onClick={onNewClick}
            aria-label="Novo"
            className="h-14 w-14 rounded-full bg-[#00D084] text-white shadow-lg shadow-[#00D084]/30 active:scale-95 transition flex items-center justify-center ring-4 ring-background"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
        {items.slice(2).map((it) => (
          <BarItem key={it.to} {...it} active={pathname.startsWith(it.to)} />
        ))}
      </div>
    </nav>
  );
}

function BarItem({
  to, label, icon: Icon, active,
}: { to: string; label: string; icon: any; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition-colors",
        active ? "text-[#00D084]" : "text-muted-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </Link>
  );
}
