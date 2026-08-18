import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Calendar, HardDrive, Mail } from "lucide-react";
import {
  getMyGoogleConnection,
  startGoogleOAuth,
  disconnectGoogle,
  testMyGoogleServices,
} from "@/lib/google/oauth.functions";

const SERVICES = [
  { key: "calendar", label: "Google Agenda", icon: Calendar },
  { key: "drive", label: "Google Drive", icon: HardDrive },
  { key: "gmail", label: "Gmail", icon: Mail },
] as const;

export function GoogleServicesCard() {
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["my-google-connection"],
    queryFn: () => getMyGoogleConnection(),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const gotMessage = useRef(false);

  useEffect(() => {
    if (data && selected.length === 0) {
      const base = data.enabledScopes.length ? data.enabledScopes : data.catalog.map((c) => c.key);
      setSelected(base);
    }
  }, [data]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const payload = ev.data as { type?: string; ok?: boolean; message?: string };
      if (payload?.type !== "google-oauth-result") return;
      gotMessage.current = true;
      if (payload.ok) toast.success("Conta Google conectada");
      else toast.error(payload.message ?? "Falha na autorização");
      void refetch();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refetch]);

  const connect = async () => {
    if (!selected.length) return toast.error("Selecione ao menos um escopo.");
    setBusy(true);
    gotMessage.current = false;
    try {
      const { authorizationUrl } = await startGoogleOAuth({
        data: { scopes: selected as never[] },
      });
      const popup = window.open(authorizationUrl, "google_oauth", "width=520,height=640");
      if (!popup) {
        toast.error("Permita pop-ups no navegador para autorizar o Google.");
        return;
      }
      popupRef.current = popup;
      const timer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(timer);
          if (!gotMessage.current) toast.message("Autorização cancelada");
          void refetch();
        }
      }, 800);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectGoogle();
      toast.success("Conta desconectada");
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const res = await testMyGoogleServices();
      for (const r of res) r.ok ? toast.success(`${r.service}: ${r.message}`) : toast.error(`${r.service}: ${r.message}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const conn = data?.connection ?? null;
  const grantedFor = (service: string) =>
    (conn?.scopes ?? []).some((s) => s.startsWith(service));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conectar minha conta Google</CardTitle>
        <CardDescription>
          A autorização abre em uma janela do Google (pop-up). Conceda as permissões desejadas para
          usar Agenda, Drive e Gmail dentro do sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !data?.configured ? (
          <p className="text-sm text-muted-foreground">
            As credenciais OAuth ainda não foram configuradas pelo administrador.
          </p>
        ) : null}

        {conn ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
            <span className="text-sm font-medium">{conn.email ?? "conta Google"}</span>
            <Badge variant={conn.status === "connected" ? "default" : "destructive"}>
              {conn.status}
            </Badge>
            {conn.lastError ? (
              <p className="w-full text-xs text-destructive">{conn.lastError}</p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            const ok = grantedFor(s.key);
            return (
              <div key={s.key} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{s.label}</span>
                </div>
                <Badge variant={ok ? "default" : "secondary"} className="mt-2">
                  {ok ? "Autorizado" : "Não autorizado"}
                </Badge>
              </div>
            );
          })}
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-medium">Permissões a solicitar</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(data?.catalog ?? []).map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(c.key)}
                  onCheckedChange={() =>
                    setSelected((s) =>
                      s.includes(c.key) ? s.filter((k) => k !== c.key) : [...s, c.key],
                    )
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={connect} disabled={busy || !data?.configured}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {conn ? "Reconectar" : "Conectar"}
          </Button>
          {conn ? (
            <>
              <Button variant="outline" onClick={test} disabled={busy}>
                Testar conexão
              </Button>
              <Button variant="destructive" onClick={disconnect} disabled={busy}>
                Desconectar
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
