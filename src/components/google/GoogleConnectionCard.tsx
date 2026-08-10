import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getGoogleConnectionStatus } from "@/lib/google/google.functions";
import { testGoogleConnection } from "@/lib/google/connection-test.functions";
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
} from "lucide-react";
import type { GoogleService } from "@/lib/google/google.functions";

const ICONS: Record<GoogleService, typeof Mail> = {
  mail: Mail,
  drive: FolderOpen,
  calendar: Calendar,
  sheets: Sheet,
};

type TestState = { loading: boolean; ok?: boolean; message?: string };

export function GoogleConnectionCard() {
  const getFn = useServerFn(getGoogleConnectionStatus);
  const testFn = useServerFn(testGoogleConnection);
  const [tests, setTests] = useState<Partial<Record<GoogleService, TestState>>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["google-connection-status"],
    queryFn: () => getFn(),
  });

  const allConnected = data?.allConnected ?? false;

  async function runTest(service: GoogleService) {
    setTests((s) => ({ ...s, [service]: { loading: true } }));
    try {
      const r = await testFn({ data: { service } });
      setTests((s) => ({ ...s, [service]: { loading: false, ok: r.ok, message: r.message } }));
    } catch (e) {
      setTests((s) => ({
        ...s,
        [service]: { loading: false, ok: false, message: (e as Error).message },
      }));
    }
  }

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
        <div className="grid gap-2 sm:grid-cols-2">
          {data?.services.map(({ service, label, connected }) => {
            const Icon = ICONS[service];
            const t = tests[service];
            return (
              <div key={service} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate font-medium">{label}</span>
                  {connected ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> OAuth ativo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <XCircle className="h-3 w-3" /> Não conectado
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runTest(service)}
                    disabled={t?.loading}
                  >
                    {t?.loading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlugZap className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Testar conexão
                  </Button>
                  {t && !t.loading && t.message && (
                    <span
                      className={
                        t.ok
                          ? "truncate text-xs text-green-600"
                          : "truncate text-xs text-destructive"
                      }
                      title={t.message}
                    >
                      {t.message}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            A autorização OAuth do Google (Gmail, Calendar, Drive e Sheets) é feita uma única vez
            pelo administrador do workspace e vale para toda a equipe. Use “Testar conexão” para
            validar cada serviço.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
