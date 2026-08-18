import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, RefreshCw } from "lucide-react";
import { getGoogleDiagnostics } from "@/lib/google/oauth.functions";

function Row({ label, value, copy }: { label: string; value: string | null; copy?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 break-all text-right font-mono text-xs">
        {value || "—"}
        {copy && value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              void navigator.clipboard.writeText(value);
              toast.success("Copiado");
            }}
          >
            <Copy className="h-3 w-3" />
          </Button>
        ) : null}
      </span>
    </div>
  );
}

export function GoogleDiagnosticsCard() {
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["google-diagnostics"],
    queryFn: () => getGoogleDiagnostics(),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Diagnóstico da integração</CardTitle>
          <CardDescription>
            Valores exatos usados na autorização — útil para conferir no Google Cloud Console.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {!data ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-4">
            <div>
              <Row label="Redirect URI em uso" value={data.redirectUri} copy />
              <Row label="Origem do app" value={data.origin} />
              <Row label="Client ID em uso" value={data.clientId} copy />
              <Row label="Client Secret salvo" value={data.hasSecret ? "sim" : "não"} />
              <Row label="Escopos habilitados" value={data.enabledScopes.join(", ") || null} />
              <Row label="Status da conexão" value={data.connectionStatus} />
              <Row label="Conta conectada" value={data.googleEmail} />
              <Row label="Escopos concedidos" value={data.grantedScopes.join(", ") || null} />
              <Row label="Último erro do Google" value={data.lastError} />
            </div>
            {data.recentEvents.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Últimos eventos</p>
                <ul className="space-y-1">
                  {data.recentEvents.map((e, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <Badge variant={e.status === "success" ? "default" : "destructive"}>
                        {e.action}
                      </Badge>
                      <span className="text-muted-foreground">
                        {new Date(e.at).toLocaleString("pt-BR")} — {e.message ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
