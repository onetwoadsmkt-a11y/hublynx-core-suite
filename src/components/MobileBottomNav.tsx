import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePriorityAlerts } from "@/components/tasks/PriorityAlerts";
import { useMyTasks } from "@/hooks/useMyTasks";
import type { useNavModel } from "@/components/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ValuesLockToggle } from "@/components/security/ValuesLockToggle";

type Model = ReturnType<typeof useNavModel>;
type Item = Model["groups"][number]["items"][number];

/** Em destaque no rodapé (na ordem), quando a pessoa tem acesso. */
const MAIN_PATHS = ["/dashboard", "/pipeline", "/tarefas", "/projetos"];

function isActive(pathname: string, to: string) {
  if (pathname === to || pathname.startsWith(to + "/")) return true;
  // Agenda: Lista/Kanban (/tarefas) e calendário (/agenda) acendem o mesmo item.
  return to === "/tarefas" && (pathname === "/agenda" || pathname.startsWith("/agenda/"));
}

/**
 * Menu de rodapé no celular (abaixo de 1024px): Dashboard, Pipeline, Agenda e Projetos em
 * destaque e "Mais" com o resto do menu numa gaveta. Fica no fluxo da página (não por cima),
 * então o conteúdo e o que é "sticky" terminam acima dele; o que é `fixed` sobe com
 * `--mobile-nav-h` (styles.css). Respeita a barra de gestos do iPhone (safe-area).
 */
export function MobileBottomNav({ model }: { model: Model }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const { count: priorityCount } = usePriorityAlerts();
  const mine = useMyTasks(model.ready);
  const myBadge = mine.late + mine.today;

  // fecha a gaveta ao trocar de página
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!model.ready) return null;
  const all: Item[] = model.groups.flatMap((g) => g.items);
  const main = MAIN_PATHS.map((p) => all.find((i) => i.to === p)).filter(Boolean) as Item[];
  const rest = all.filter((i) => !MAIN_PATHS.includes(i.to));
  const showMine = model.hasAgenda || main.some((i) => i.to === "/projetos");
  const moreActive = rest.some((i) => isActive(pathname, i.to)) || pathname === "/minhas-tarefas";

  return (
    <>
      {open && (
        <MoreSheet
          onClose={() => setOpen(false)}
          items={rest}
          pathname={pathname}
          priorityCount={model.hasAgenda ? priorityCount : 0}
          showMine={showMine}
          myBadge={myBadge}
          myLate={mine.late > 0}
        />
      )}
      <nav
        aria-label="Menu principal"
        className="mobile-bottom-nav relative z-[43] shrink-0 border-t bg-background/95 shadow-[0_-6px_20px_rgba(10,37,87,.08)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto grid h-16 max-w-lg items-stretch px-1" style={{ gridTemplateColumns: `repeat(${main.length + 1}, minmax(0, 1fr))` }}>
          {main.map((it) => {
            const on = !open && isActive(pathname, it.to);
            const badge = it.to === "/tarefas" ? priorityCount : 0;
            return (
              <Link key={it.to} to={it.to} aria-current={on ? "page" : undefined} className="flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold">
                <NavIcon icon={it.icon} on={on} badge={badge} />
                <span className={cn("max-w-full truncate", on ? "text-foreground" : "text-muted-foreground")}>{it.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className="flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold"
          >
            <NavIcon icon={open ? X : Menu} on={open || moreActive} badge={!showMine || main.some((i) => i.to === "/tarefas") ? 0 : myBadge} />
            <span className={open || moreActive ? "text-foreground" : "text-muted-foreground"}>Mais</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function NavIcon({ icon: Icon, on, badge }: { icon: Item["icon"]; on: boolean; badge: number }) {
  return (
    <span className={cn("relative grid h-8 w-14 place-items-center rounded-full transition-colors", on ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
      <Icon className="h-5 w-5" strokeWidth={on ? 2.4 : 2} />
      {badge > 0 && (
        <span className="absolute -top-1 right-2 min-w-[18px] rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-[18px] text-destructive-foreground ring-2 ring-background">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </span>
  );
}

function MoreSheet({
  onClose, items, pathname, priorityCount, showMine, myBadge, myLate,
}: {
  onClose: () => void; items: Item[]; pathname: string; priorityCount: number; showMine: boolean; myBadge: number; myLate: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  useEffect(() => panel.current?.focus(), []);

  const tile = (active: boolean) =>
    cn("flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card px-1 py-3 text-center text-[12px] font-semibold leading-tight", active && "border-primary ring-2 ring-primary/40");

  return (
    <>
      <div className="fixed inset-0 z-[41] bg-black/50 animate-in fade-in lg:hidden" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Mais opções do menu"
        tabIndex={-1}
        className="fixed inset-x-0 z-[42] max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t bg-background p-4 shadow-2xl outline-none animate-in slide-in-from-bottom-8 lg:hidden"
        style={{ bottom: "var(--mobile-nav-h)", transform: drag ? `translateY(${drag}px)` : undefined }}
        onTouchStart={(e) => { startY.current = e.touches[0]!.clientY; }}
        onTouchMove={(e) => {
          if (startY.current == null || (panel.current?.scrollTop ?? 0) > 0) return;
          setDrag(Math.max(0, e.touches[0]!.clientY - startY.current));
        }}
        onTouchEnd={() => { if (drag > 80) onClose(); setDrag(0); startY.current = null; }}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
        <div className="mb-3 flex items-center">
          <p className="text-base font-bold">Mais opções</p>
          <button type="button" onClick={onClose} aria-label="Fechar" className="ml-auto grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {priorityCount > 0 && (
            <Link to="/tarefas" search={{ prioridade: 1 } as any} className={tile(false)}>
              <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle className="h-5 w-5" /></span>
              Prioridade · {priorityCount > 99 ? "99+" : priorityCount}
            </Link>
          )}
          {showMine && (
            <Link to={"/minhas-tarefas" as any} className={tile(pathname === "/minhas-tarefas")}>
              <span className={cn("grid h-10 w-10 place-items-center rounded-xl", myLate ? "bg-destructive/10 text-destructive" : "bg-primary/15 text-foreground")}><ClipboardList className="h-5 w-5" /></span>
              Minhas tarefas{myBadge > 0 ? ` · ${myBadge > 99 ? "99+" : myBadge}` : ""}
            </Link>
          )}
          {items.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className={tile(isActive(pathname, to))}>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-foreground"><Icon className="h-5 w-5" /></span>
              {label}
            </Link>
          ))}
        </div>
        {/* saíram da barra de cima no celular */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-2.5 text-sm">
          <span className="font-semibold">Exibição</span>
          <span className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Valores</span><ValuesLockToggle /><span className="text-xs text-muted-foreground">Tema</span><ThemeToggle /></span>
        </div>
      </div>
    </>
  );
}
