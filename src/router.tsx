import { MutationCache, QueryClient, onlineManager } from "@tanstack/react-query";
import { toast } from "sonner";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * O React Query decide "online/offline" pelos eventos do navegador; no iPhone/Android o evento
 * "online" pode não chegar depois que o app volta do segundo plano. Confere de novo o estado
 * real ao voltar para a tela, ao focar e ao reconectar.
 */
let onlineSynced = false;
function syncOnlineState() {
  if (onlineSynced || typeof window === "undefined") return;
  onlineSynced = true;
  const sync = () => onlineManager.setOnline(navigator.onLine !== false);
  onlineManager.setEventListener((setOnline) => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const vis = () => { if (document.visibilityState === "visible") setOnline(navigator.onLine !== false); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("focus", vis);
    window.addEventListener("pageshow", vis);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("focus", vis);
      window.removeEventListener("pageshow", vis);
      document.removeEventListener("visibilitychange", vis);
    };
  });
  sync();
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    // Nenhuma gravação falha em silêncio: se a tela não tratou o erro, mostra o aviso.
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.options.onError) return;
        const msg = error instanceof Error ? error.message : String(error ?? "");
        toast.error(/failed to fetch|load failed|network/i.test(msg)
          ? "Não foi possível salvar: sem conexão com o Core. Confira a internet e tente de novo."
          : `Não foi possível salvar: ${msg || "erro desconhecido"}`);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true, // internet voltou: atualiza as telas abertas
        retry: 1,
      },
      // Gravações sempre vão para o servidor. Antes ficavam "em espera" quando o app achava
      // que estava sem internet (no celular isso fica preso depois de voltar do segundo plano):
      // o botão ficava carregando e nada era salvo, sem aviso. Sem internet de verdade, a
      // chamada falha e a tela mostra o erro.
      mutations: { networkMode: "always" },
    },
  });
  syncOnlineState();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
