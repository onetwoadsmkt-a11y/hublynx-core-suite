import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tempo real do projeto: ouve o canal privado "project:<id>" (o banco avisa a cada
 * mudança, feita no Core ou no portal) e chama `onChange` com as tabelas que
 * mudaram, agrupando rajadas de avisos. O aviso não traz dados: a tela recarrega
 * pelas funções de sempre, que conferem a permissão.
 * Se a conexão cair e voltar, pede uma atualização completa (pode ter perdido avisos).
 */
export function useProjectEvents(
  client: SupabaseClient | null,
  projectId: string | null | undefined,
  onChange: (tables: Set<string>) => void,
) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!client || !projectId || typeof window === "undefined") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    const flush = () => {
      if (!alive) return;
      const tables = new Set(pending);
      pending.clear();
      cb.current(tables);
    };
    const channel = client.channel(`project:${projectId}`, { config: { private: true } });
    channel.on("broadcast", { event: "changed" }, (msg) => {
      const table = (msg?.payload as { table?: string } | undefined)?.table ?? "*";
      pending.add(table);
      clearTimeout(timer);
      timer = setTimeout(flush, 350);
    });
    let connectedOnce = false;
    (async () => {
      try {
        await client.realtime.setAuth();
      } catch {
        /* sem sessão: o canal privado recusa e a tela segue com a atualização periódica */
      }
      if (!alive) return;
      channel.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (connectedOnce) {
          pending.add("*");
          flush();
        }
        connectedOnce = true;
      });
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
      client.removeChannel(channel);
    };
  }, [client, projectId]);
}
