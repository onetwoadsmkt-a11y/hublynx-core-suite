import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { pruneDrafts } from "@/lib/persist/draft";

/**
 * Aviso quando a internet cai. O que estava sendo digitado fica guardado neste aparelho,
 * anexos esperam na fila e as ações já feitas continuam salvas no Core.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [back, setBack] = useState(false);
  useEffect(() => {
    pruneDrafts();
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    let t: ReturnType<typeof setTimeout> | undefined;
    const down = () => { setOffline(true); setBack(false); };
    const up = () => {
      setOffline(false);
      setBack(true);
      clearTimeout(t);
      t = setTimeout(() => setBack(false), 4000);
    };
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    return () => {
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
      clearTimeout(t);
    };
  }, []);
  if (!offline && !back) return null;
  return (
    <div
      role="status"
      className={
        offline
          ? "fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-black"
          : "fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-emerald-600 px-4 py-1.5 text-center text-xs font-semibold text-white"
      }
    >
      {offline ? (
        <>
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          Sem internet. O que você está digitando fica guardado neste aparelho e os anexos são enviados quando a conexão voltar. Pode recarregar a página sem perder.
        </>
      ) : (
        "Conexão de volta. Enviando o que ficou pendente…"
      )}
    </div>
  );
}
