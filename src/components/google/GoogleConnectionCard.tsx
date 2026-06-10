import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getGoogleConnectionStatus } from "@/lib/google/google.functions";
import { Mail, FolderOpen, Calendar, Sheet, CheckCircle2, XCircle, Info } from "lucide-react";
import type { GoogleService } from "@/lib/google/google.functions";

const ICONS: Record<GoogleService, typeof Mail> = {
  mail: Mail,
  drive: FolderOpen,
  calendar: Calendar,
  sheets: Sheet,
};

export function GoogleConnectionCard() {
  const getFn = useServerFn(getGoogleConnectionStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["google-connection-status"],
    queryFn: () => getFn(),
  });

  const allConnected = data?.allConnected ?? false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              Google Workspace
              {!isLoading &&
                (allConnected ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <XCircle className="h-3 w-3" /> Pendente
                  </Badge>
                ))}
            </CardTitle>
            <CardDescription>
              {data?.email
                ? `Conectado como ${data.email}`
                : "Conta Google compartilhada por toda a equipe Hublynx."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data?.services.map(({ service, label, connected }) => {
            const Icon = ICONS[service];
            return (
              <div
                key={service}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{label}</span>
                {connected ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Esta conexão é compartilhada por toda a equipe. E-mails, eventos, arquivos e planilhas
            são gerenciados pela conta Google da agência. A configuração é feita pelo administrador
            do workspace na Lovable — não há ação necessária aqui.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
