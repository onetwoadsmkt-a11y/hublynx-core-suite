import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { connectAppUser } from "@/integrations/lovable/appUserConnectorClient";
import {
  GOOGLE_GATEWAY_URL,
  disconnectGoogle,
  getGoogleConnection,
  saveGoogleConnection,
  startGoogleConnect,
} from "@/lib/google/google.functions";
import { Mail, FolderOpen, Calendar, Sheet, CheckCircle2, Loader2 } from "lucide-react";

const FAMILIES = [
  { icon: Mail, label: "Gmail" },
  { icon: FolderOpen, label: "Google Drive" },
  { icon: Calendar, label: "Google Calendar" },
  { icon: Sheet, label: "Google Sheets" },
];

export function GoogleConnectionCard() {
  const qc = useQueryClient();
  const startFn = useServerFn(startGoogleConnect);
  const saveFn = useServerFn(saveGoogleConnection);
  const disconnectFn = useServerFn(disconnectGoogle);
  const getFn = useServerFn(getGoogleConnection);

  const { data, isLoading } = useQuery({
    queryKey: ["google-connection"],
    queryFn: () => getFn(),
  });

  const connect = useMutation({
    mutationFn: async () => {
      const result = await connectAppUser({
        connectorId: "google",
        gatewayBaseUrl: GOOGLE_GATEWAY_URL,
        start: (targetOrigin) => startFn({ data: { targetOrigin } }),
      });
      if (!result.success || !result.connectionAPIKey) {
        throw new Error(result.error ?? "Falha ao conectar");
      }
      return saveFn({ data: { connectionAPIKey: result.connectionAPIKey } });
    },
    onSuccess: (r) => {
      toast.success(`Google conectado${r.email ? ` (${r.email})` : ""}`);
      qc.invalidateQueries({ queryKey: ["google-connection"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Google desconectado");
      qc.invalidateQueries({ queryKey: ["google-connection"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const connected = !!data?.connection;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Google Workspace
              {connected && (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Conectado
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {connected
                ? `Conectado como ${data?.connection?.email ?? "sua conta Google"}`
                : "Conecte sua conta Google para usar Gmail, Drive, Calendar e Sheets dentro do Hublynx."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {FAMILIES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {!connected ? (
            <Button onClick={() => connect.mutate()} disabled={connect.isPending || isLoading}>
              {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Conectar Google
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desconectar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
