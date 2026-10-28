import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRouter } from "@tanstack/react-router";

type Notification = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

/** Som curto de aviso (duas notas), gerado no navegador — sem arquivo de áudio. */
function playChime() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const start = t0 + i * 0.16;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      o.connect(g).connect(ctx.destination);
      o.start(start);
      o.stop(start + 0.3);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    /* navegador sem áudio ou bloqueado até o primeiro clique */
  }
}

export function NotificationsBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const go = (link: string) => router.history.push(link);

  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data as Notification[];
    },
    refetchInterval: 30000,
  });

  // Aviso novo: som + mensagem na tela (com atalho para a tarefa) e atualiza o sino.
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!alive || !uid) return;
      ch = supabase.channel(`notifications-bell-${uid}-${Math.random().toString(36).slice(2)}`);
      ch.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        (payload) => {
          const n = payload.new as Notification;
          qc.invalidateQueries({ queryKey: ["notifications"] });
          qc.invalidateQueries({ queryKey: ["my-assigned-tasks"] });
          if (!n?.id || seen.current.has(n.id)) return;
          seen.current.add(n.id);
          playChime();
          toast(n.title, {
            description: n.body ?? undefined,
            action: n.link ? { label: "Abrir", onClick: () => go(n.link!) } : undefined,
            duration: 8000,
          });
        },
      ).subscribe();
    });
    return () => {
      alive = false;
      if (ch) supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  const unread = items.filter((n) => !n.read).length;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ read: true }).eq("read", false);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function handleClick(n: Notification) {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) go(n.link);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 rounded-full bg-[#00D084] text-white text-[10px] font-semibold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="text-sm font-semibold">Notificações</p>
          {unread > 0 && (
            <button onClick={() => markAll.mutate()} className="text-xs text-muted-foreground hover:text-foreground">
              Marcar todas como lidas
            </button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Nenhuma notificação.</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`px-4 py-3 hover:bg-muted/50 cursor-pointer ${!n.read ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-[#00D084] shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
