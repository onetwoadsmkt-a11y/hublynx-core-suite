import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BellRing, BellOff, Check } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { saveSubscription, getVapidPublicKey, sendTestPush } from "@/lib/push/push.functions";

export const Route = createFileRoute("/_authenticated/app/lembretes")({
  component: LembretesMobile,
});

const VAPID_PUBLIC_KEY = ""; // configurar depois — necessário para Web Push

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function LembretesMobile() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const save = useServerFn(saveSubscription);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
    navigator.serviceWorker?.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => setSubscribed(!!s))
      .catch(() => {});
  }, []);

  const enable = async () => {
    try {
      if (!("Notification" in window)) {
        toast.error("Este dispositivo não suporta notificações.");
        return;
      }
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error("Permissão negada.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        if (!VAPID_PUBLIC_KEY) {
          // Sem VAPID configurado, só mostra notificação local de teste
          await reg.showNotification("Notificações ativadas! 🎉", {
            body: "Você receberá lembretes das suas tarefas aqui.",
            icon: "/icon-tarefas-512.png",
          });
          setSubscribed(true);
          toast.success("Notificações locais ativadas.");
          return;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const json = sub.toJSON() as any;
      await save({
        data: {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          userAgent: navigator.userAgent,
        },
      });
      setSubscribed(true);
      toast.success("Lembretes ativados!");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao ativar.");
    }
  };

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Lembretes</h1>

      <Card className="rounded-2xl p-5 bg-gradient-to-br from-amber-50 to-orange-50 border-0">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <BellRing className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-amber-900">Notificações no celular</h2>
            <p className="text-sm text-amber-800/80 mt-1">
              Receba alertas das suas tarefas direto neste app, mesmo com ele fechado.
            </p>
            {permission === "granted" && subscribed ? (
              <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <Check className="h-4 w-4" /> Ativo
              </div>
            ) : (
              <Button onClick={enable} className="mt-3 rounded-full bg-amber-500 hover:bg-amber-600 text-white">
                Ativar lembretes
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold">Opções por tarefa</h3>
        <p className="text-sm text-muted-foreground">
          Ao criar ou editar uma tarefa, escolha quando ser lembrado:
        </p>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#00D084]" /> No horário</li>
          <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#00D084]" /> 1 hora antes</li>
          <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#00D084]" /> 1 dia antes</li>
          <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#00D084]" /> Toda semana</li>
          <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#00D084]" /> Todo mês</li>
        </ul>
      </Card>

      {permission === "denied" && (
        <Card className="rounded-2xl p-4 flex items-center gap-3 text-sm text-muted-foreground">
          <BellOff className="h-4 w-4" />
          Permissão bloqueada nas configurações do navegador.
        </Card>
      )}
    </div>
  );
}
