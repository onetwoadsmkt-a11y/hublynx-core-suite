import { useEffect, useRef, useState } from "react";
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
  Loader2,
  PlugZap,
  Unlink,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const ICONS: Record<GoogleConnectorId, typeof Mail> = {
  google_mail: Mail,
  google_calendar: Calendar,
  google_drive: FolderOpen,
  google_sheets: Sheet,
};

const QUEUE_KEY = "hublynx_google_connect_queue";

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.4-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.7a14.6 14.6 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.6 2.2-8.7 2.2-6.3 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

export function GoogleConnectionCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(getMyGoogleConnections);
  const startFn = useServerFn(startGoogleAppUserConnect);
  const testFn = useServerFn(testMyGoogleConnection);
  const disconnectFn = useServerFn(disconnectMyGoogleConnection);

  const [connecting, setConnecting] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [busy, setBusy] = useState<Partial<Record<GoogleConnectorId, boolean>>>({});
  const [results, setResults] = useState<
    Partial<Record<GoogleConnectorId, { ok: boolean; message: string }>>
  >({});
  const resumed = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ["my-google-connections"],
    queryFn: () => listFn(),
  });

  const services = data ?? [];
  const connectedCount = services.filter((s) => s.connected).length;
  const account = services.find((s) => s.email)?.email ?? null;
  const allConnected = services.length > 0 && connectedCount === services.length;

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-google-connections"] });

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
          (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
        )
          return;
        cleanup();
        if (type === "appUserConnectorOAuthComplete") return resolve();
        reject(new Error("A autorização do Google não foi concluída."));
      };
      window.addEventListener("message", onMessage);
      poll = window.setInterval(() => {
        if (!popup.closed) return;
        cleanup();
        reject(new Error("A janela do Google foi fechada antes de concluir."));
      }, 600);
    });
  }

  /** Executa o consentimento de uma lista de serviços reutilizando a mesma janela. */
  async function runQueue(queue: GoogleConnectorId[], popup: Window | null) {
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!;
      const label = services.find((s) => s.connectorId === id)?.label ?? id;
      setStep(`Autorizando ${label}…`);
      const { authorizationUrl } = await startFn({ data: { connectorId: id } });

      if (!popup || popup.closed) {
        // Sem pop-up: guarda o restante da fila e segue na mesma aba.
        sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(i)));
        window.location.href = authorizationUrl;
        return false;
      }
      const completion = waitForOAuthCompletion(popup);
      popup.location.href = authorizationUrl;
      await completion;
    }
    sessionStorage.removeItem(QUEUE_KEY);
    popup?.close();
    return true;
  }

  async function connectAccount(only?: GoogleConnectorId) {
    const queue: GoogleConnectorId[] = only
      ? [only]
      : (services.map((s) => s.connectorId) as GoogleConnectorId[]);
    if (!queue.length) return;
    const popup = window.open("", "hublynx-google-oauth", "width=520,height=680");
    setConnecting(true);
    try {
      const done = await runQueue(queue, popup);
      if (done) {
        toast.success("Conta Google conectada.");
        await refresh();
      }
    } catch (e) {
      popup?.close();
      sessionStorage.removeItem(QUEUE_KEY);
      toast.error((e as Error).message);
    } finally {
      setConnecting(false);
      setStep(null);
    }
  }

  // Retoma a fila após voltar do Google na mesma aba.
  useEffect(() => {
    if (resumed.current || !services.length) return;
    const raw = sessionStorage.getItem(QUEUE_KEY);
    if (!raw) return;
    resumed.current = true;
    let rest: GoogleConnectorId[] = [];
    try {
      rest = (JSON.parse(raw) as GoogleConnectorId[]).slice(1);
    } catch {
      rest = [];
    }
    sessionStorage.removeItem(QUEUE_KEY);
    if (!rest.length) {
      toast.success("Conta Google conectada.");
      void refresh();
      return;
    }
    setConnecting(true);
    void runQueue(rest, null)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setConnecting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services.length]);

  async function test(id: GoogleConnectorId) {
    setBusy((s) => ({ ...s, [id]: true }));
    try {
      const r = await testFn({ data: { connectorId: id } });
      setResults((s) => ({ ...s, [id]: { ok: r.ok, message: r.message } }));
    } catch (e) {
      setResults((s) => ({ ...s, [id]: { ok: false, message: (e as Error).message } }));
    } finally {
      setBusy((s) => ({ ...s, [id]: false }));
    }
  }

  async function disconnectAll() {
    setConnecting(true);
    try {
      for (const s of services.filter((x) => x.connected)) {
        await disconnectFn({ data: { connectorId: s.connectorId as GoogleConnectorId } });
      }
      setResults({});
      toast.success("Conta Google desconectada.");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Conta Google
          {!isLoading && (
            <Badge variant={connectedCount ? "secondary" : "outline"} className="gap-1">
              {connectedCount ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {connectedCount ? `${connectedCount}/${services.length} serviços` : "Não conectada"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Faça login com sua conta Google uma única vez para liberar Gmail, Google Agenda, Drive e
          Planilhas dentro do Hublynx.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-4">
          <Button size="lg" onClick={() => void connectAccount()} disabled={connecting || isLoading}>
            {connecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GoogleGlyph className="mr-2 h-4 w-4" />
            )}
            {allConnected ? "Reconectar conta Google" : "Conectar conta Google"}
          </Button>
          {connectedCount > 0 && (
            <Button variant="ghost" onClick={() => void disconnectAll()} disabled={connecting}>
              <Unlink className="mr-1.5 h-4 w-4" /> Desconectar
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => void refresh()} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <div className="w-full text-xs text-muted-foreground">
            {step
              ? step
              : account
                ? `Conectado como ${account}`
                : "Você autoriza cada serviço em sequência na janela do Google."}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => {
            const id = s.connectorId as GoogleConnectorId;
            const Icon = ICONS[id];
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
                      <XCircle className="h-3 w-3" /> Pendente
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void test(id)}
                    disabled={!s.connected || busy[id]}
                  >
                    {busy[id] ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlugZap className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Testar
                  </Button>
                  {!s.connected && (
                    <Button size="sm" variant="ghost" onClick={() => void connectAccount(id)} disabled={connecting}>
                      Conectar só este
                    </Button>
                  )}
                </div>
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
      </CardContent>
    </Card>
  );
}
