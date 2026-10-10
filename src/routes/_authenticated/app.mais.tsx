import { createFileRoute, Link } from "@tanstack/react-router";
import { clearBrandCache } from "@/hooks/useWorkspace";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Tag, FileText, Settings, Wifi, WifiOff, Download, LogOut, BellRing } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/mais")({
  component: MaisMobile,
});

function MaisMobile() {
  const [online, setOnline] = useState(true);
  const [installEvent, setInstallEvent] = useState<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const onInstall = (e: any) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  const items = [
    { to: "/clientes", label: "Clientes", icon: Users },
    { to: "/app/lembretes", label: "Lembretes", icon: BellRing },
    { to: "/configuracoes", label: "Configurações", icon: Settings },
  ];

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Mais</h1>

      <Card className="rounded-2xl p-4 flex items-center gap-3">
        {online ? (
          <>
            <Wifi className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-medium">Online</span>
          </>
        ) : (
          <>
            <WifiOff className="h-5 w-5 text-rose-600" />
            <span className="text-sm font-medium">Offline</span>
          </>
        )}
      </Card>

      {installEvent && (
        <Card className="rounded-2xl p-4 bg-gradient-to-br from-[#00D084]/10 to-[#00D084]/5 border-[#00D084]/20">
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 text-[#00D084]" />
            <div className="flex-1">
              <p className="font-semibold text-sm">Instalar Central de Tarefas</p>
              <p className="text-xs text-muted-foreground mt-0.5">Adicione na tela inicial do seu celular.</p>
            </div>
            <Button size="sm" onClick={install} className="rounded-full bg-[#00D084] hover:bg-[#00b873] text-white">
              Instalar
            </Button>
          </div>
        </Card>
      )}

      <Card className="rounded-2xl divide-y overflow-hidden">
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className="flex items-center gap-3 px-4 py-4 hover:bg-accent/40 transition"
          >
            <it.icon className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 font-medium">{it.label}</span>
            <span className="text-muted-foreground">›</span>
          </Link>
        ))}
      </Card>

      <Button
        variant="outline"
        className="w-full rounded-full"
        onClick={async () => { clearBrandCache(); await supabase.auth.signOut(); window.location.href = "/auth"; }}
      >
        <LogOut className="h-4 w-4 mr-2" /> Sair
      </Button>

      <p className="text-center text-xs text-muted-foreground pt-2">Hublynx Core · Central de Tarefas</p>
    </div>
  );
}
