import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getMyGoogleConnections,
  startGoogleAppUserConnect,
  testMyGoogleConnection,
  disconnectMyGoogleConnection,
} from "@/lib/google/app-user.functions";
import type { GoogleConnectorId } from "@/lib/google/app-user.functions";
import {
  Mail,
  FolderOpen,
  Calendar,
  Sheet,
  CheckCircle2,
  XCircle,
  Info,
  Loader2,
  PlugZap,
  LinkIcon,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";

const ICONS: Record<GoogleConnectorId, typeof Mail> = {
  google_mail: Mail,
  google_calendar: Calendar,
  google_drive: FolderOpen,
  google_sheets: Sheet,
};

type Busy = { connecting?: boolean; testing?: boolean; disconnecting?: boolean };

function waitForOAuthCompletion(popup: Window) {
  return new Promise<void>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") return resolve();
      popup.close();
      reject(new Error("A conexão não foi concluída."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("A janela foi fechada antes de concluir."));
    }, 500);
  });
}

export function GoogleConnectionCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(getMyGoogleConnections);
  const startFn = useServerFn(startGoogleAppUserConnect);
  const testFn = useServerFn(testMyGoogleConnection);
  const disconnectFn = useServerFn(disconnectMyGoogleConnection);
  const [busy, setBusy] = useState<Partial<Record<GoogleConnectorId, Busy>>>({});
  const [results, setResults] = useState<
    Partial<Record<GoogleConnectorId, { ok: boolean; message: string }>>
  >({});

  const { data, isLoading } = useQuery({
    queryKey: ["my-google-connections"],
    queryFn: () => listFn(),
  });

  const setB = (id: GoogleConnectorId, v: Busy) => setBusy((s) => ({ ...s, [id]: v }));
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-google-connections"] });

  async function connect(connectorId: GoogleConnectorId) {
    const popup = window.open("", "hublynx-google-oauth", "width=600,height=720");
    if (!popup) {
      toast.error("Pop-up bloqueado. Libere pop-ups e tente novamente.");
      return;
    }
    setB(connectorId, { connecting: true });
    try {
      const { authorizationUrl } = await startFn({ data: { connectorId } });
      const completion = waitForOAuthCompletion(popup);
      popup.location.href = authorizationUrl;
      await completion;
      toast.success("Conta Google conectada.");
      await refresh();
    } catch (e) {
      popup.close();
      toast.error((e as Error).message);
    } finally {
      setB(connectorId, {});
    }
  }

  async function test(connectorId: GoogleConnectorId) {
    setB(connectorId, { testing: true });
    try {
      const r = await testFn({ data: { connectorId } });
      setResults((s) => ({ ...s, [connectorId]: { ok: r.ok, message: r.message } }));
    } catch (e) {
      setResults((s) => ({ ...s, [connectorId]: { ok: false, message: (e as Error).message } }));
    } finally {
      setB(connectorId, {});
    }
  }

  async function disconnect(connectorId: GoogleConnectorId) {
    setB(connectorId, { disconnecting: true });
    try {
      await disconnectFn({ data: { connectorId } });
      setResults((s) => ({ ...s, [connectorId]: undefined as never }));
      toast.success("Conta desconectada.");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setB(connectorId, {});
    }
  }

  const connectedCount = data?.filter((s) => s.connected).length ?? 0;
  const pendingSetup = (data ?? []).some((s) => !s.clientConfigured);

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            Minhas contas Google
            {!isLoading && (
              <Badge variant={connectedCount ? "secondary" : "outline"} className="gap-1">
                {connectedCount ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <XCircle className="h-3 w-3" />
                )}
                {connectedCount}/{data?.length ?? 4} conectados
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Conecte sua própria conta do Google. Cada usuário autoriza individualmente Gmail,
            Calendar, Drive e Sheets.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {(data ?? []).map((s) => {
            const id = s.connectorId as GoogleConnectorId;
            const Icon = ICONS[id];
            const b = busy[id] ?? {};
            const r = results[id];
            return (
              <div key={id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate font-medium">{s.label}</span>
                  {s.connected ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Conectado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <XCircle className="h-3 w-3" /> Não conectado
                    </Badge>
                  )}
                </div>
                {s.email && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{s.email}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => connect(id)}
                    disabled={b.connecting || !s.clientConfigured}
                  >
                    {b.connecting ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {s.connected ? "Reconectar" : "Conectar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => test(id)}
                    disabled={b.testing || !s.connected}
                  >
                    {b.testing ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlugZap className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Testar
                  </Button>
                  {s.connected && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => disconnect(id)}
                      disabled={b.disconnecting}
                    >
                      <Unlink className="mr-1.5 h-3.5 w-3.5" /> Desconectar
                    </Button>
                  )}
                </div>
                {!s.clientConfigured && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Aguardando configuração do cliente OAuth pelo administrador.
                  </p>
                )}
                {r && (
                  <p
                    className={`mt-2 truncate text-xs ${r.ok ? "text-green-600" : "text-destructive"}`}
                    title={r.message}
                  >
                    {r.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {pendingSetup
              ? "A autorização por usuário ainda depende do cadastro do cliente OAuth do Google no workspace. Assim que ele for criado, os botões “Conectar” ficam ativos."
              : "Ao clicar em “Conectar”, uma janela do Google abre para você autorizar sua conta. A autorização vale apenas para o seu usuário."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
