import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/components/finance/KpiCard";
import { formatDateBR } from "@/lib/finance/format";
import { getFiscalDocument, listFiscalDocuments } from "@/lib/fiscal/fiscal.functions";
import { listClients } from "@/lib/clients/clients.functions";
import { FISCAL_STATUS_LABEL, type FiscalDocumentStatus } from "@/lib/fiscal/types";
import { FiscalStatusBadge } from "./FiscalStatusBadge";
import { FiscalDocumentDialog } from "./FiscalDocumentDialog";

const STATUSES: FiscalDocumentStatus[] = [
  "rascunho",
  "pendente",
  "processando",
  "autorizada",
  "rejeitada",
  "cancelada",
  "erro",
];

export function FiscalDocuments() {
  const listFn = useServerFn(listFiscalDocuments);
  const detailFn = useServerFn(getFiscalDocument);
  const clientsFn = useServerFn(listClients);

  const [status, setStatus] = useState<string>("all");
  const [clientId, setClientId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: clients } = useQuery({ queryKey: ["clients", "list"], queryFn: () => clientsFn() });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["fiscal", "documents", status, clientId, from, to],
    queryFn: () =>
      listFn({
        data: {
          status: status as never,
          clientId,
          from: from || null,
          to: to || null,
        },
      }),
  });

  const { data: detail } = useQuery({
    queryKey: ["fiscal", "document", openId],
    queryFn: () => detailFn({ data: { id: openId as string } }),
    enabled: !!openId,
  });

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-3 p-4 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {FISCAL_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Cliente</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(clients?.clients ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Competência de</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Competência</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>DPS</TableHead>
            <TableHead>NFS-e</TableHead>
            <TableHead>Emissão</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                Carregando documentos…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && (rows ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                Nenhum documento fiscal encontrado para os filtros escolhidos.
              </TableCell>
            </TableRow>
          )}
          {(rows ?? []).map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">{d.client_name ?? "—"}</TableCell>
              <TableCell>{d.competencia ? formatDateBR(d.competencia) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{brl(d.valor_servicos)}</TableCell>
              <TableCell>
                <FiscalStatusBadge status={d.status} />
              </TableCell>
              <TableCell>
                {d.dps_numero ? `${d.dps_serie ? `${d.dps_serie}/` : ""}${d.dps_numero}` : "—"}
              </TableCell>
              <TableCell>{d.nfse_numero ?? "—"}</TableCell>
              <TableCell>{d.data_emissao ? formatDateBR(d.data_emissao) : "—"}</TableCell>
              <TableCell className="text-right">
                <Button size="icon" variant="ghost" onClick={() => setOpenId(d.id)}>
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <FiscalDocumentDialog
        open={!!openId}
        detail={openId ? (detail ?? null) : null}
        onClose={() => setOpenId(null)}
      />
    </Card>
  );
}
