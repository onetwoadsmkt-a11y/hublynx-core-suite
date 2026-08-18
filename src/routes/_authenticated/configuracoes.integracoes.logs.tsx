import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listGoogleOAuthLogs } from "@/lib/google/oauth.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes/integracoes/logs")({
  head: () => ({
    meta: [
      { title: "Logs de integrações — Hublynx Core" },
      {
        name: "description",
        content: "Histórico de conexões, testes e desconexões das contas Google por usuário.",
      },
      { property: "og:title", content: "Logs de integrações — Hublynx Core" },
      {
        property: "og:description",
        content: "Histórico de conexões, testes e desconexões das contas Google por usuário.",
      },
    ],
  }),
  component: LogsPage,
});

const SERVICE_LABEL: Record<string, string> = {
  google_mail: "Gmail",
  google_calendar: "Google Calendar",
  google_drive: "Google Drive",
  google_sheets: "Google Sheets",
};

const ACTION_LABEL: Record<string, string> = {
  connect_start: "Início da conexão",
  connect_complete: "Conexão concluída",
  test: "Teste",
  disconnect: "Desconexão",
};

function LogsPage() {
  const listFn = useServerFn(listGoogleOAuthLogs);
  const [userId, setUserId] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["google-oauth-logs", userId],
    queryFn: () => listFn({ data: { userId: userId === "all" ? null : userId } }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Logs de integrações</h1>
        <p className="text-muted-foreground">
          Histórico de conexões, testes e desconexões das contas Google.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Eventos OAuth</CardTitle>
            <CardDescription>
              {data?.isAdmin
                ? "Como administrador você vê os eventos de todos os usuários."
                : "Você vê apenas os eventos da sua conta."}
            </CardDescription>
          </div>
          {data?.isAdmin && (
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Todos os usuários" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os usuários</SelectItem>
                {(data?.users ?? []).map((u: { id: string; full_name: string | null }) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name ?? u.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando logs…
            </div>
          ) : (data?.logs ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum evento registrado ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead className="whitespace-nowrap">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.logs ?? []).map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        {SERVICE_LABEL[l.connector_id] ?? l.connector_id}
                        {l.account_email && (
                          <span className="block text-xs text-muted-foreground">
                            {l.account_email}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{ACTION_LABEL[l.action] ?? l.action}</TableCell>
                      <TableCell>
                        <Badge variant={l.status === "success" ? "secondary" : "destructive"}>
                          {l.status === "success" ? "Sucesso" : "Erro"}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-[22rem] truncate text-muted-foreground"
                        title={l.message ?? ""}
                      >
                        {l.message ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
