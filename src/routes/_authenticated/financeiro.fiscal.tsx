import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl } from "@/components/finance/KpiCard";
import { FiscalSettingsForm } from "@/components/fiscal/FiscalSettingsForm";
import { FiscalServiceCodes } from "@/components/fiscal/FiscalServiceCodes";
import { FiscalDocuments } from "@/components/fiscal/FiscalDocuments";
import { getFiscalOverview } from "@/lib/fiscal/fiscal.functions";
import { FISCAL_ENVIRONMENT_LABEL, type FiscalDocumentStatus } from "@/lib/fiscal/types";

export const Route = createFileRoute("/_authenticated/financeiro/fiscal")({
  component: FiscalPage,
});

const CARDS: { key: FiscalDocumentStatus; label: string; tone: string }[] = [
  { key: "pendente", label: "Pendentes", tone: "text-amber-600" },
  { key: "processando", label: "Em processamento", tone: "text-sky-600" },
  { key: "autorizada", label: "Autorizadas", tone: "text-emerald-600" },
  { key: "rejeitada", label: "Rejeitadas", tone: "text-red-600" },
  { key: "cancelada", label: "Canceladas", tone: "text-muted-foreground" },
];

function FiscalPage() {
  const overviewFn = useServerFn(getFiscalOverview);
  const { data } = useQuery({ queryKey: ["fiscal", "overview"], queryFn: () => overviewFn() });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Fiscal</h2>
          <p className="text-sm text-muted-foreground">
            Configuração e acompanhamento das NFS-e. A emissão junto à prefeitura ainda não está
            ligada.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {FISCAL_ENVIRONMENT_LABEL[data?.ambiente ?? "homologacao"]}
          </Badge>
          <Badge variant={data?.configurado ? "default" : "secondary"}>
            {data?.configurado ? "Configuração ativa" : "Configuração pendente"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {CARDS.map((c) => (
          <Card key={c.key} className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${c.tone}`}>
              {data?.counts[c.key] ?? 0}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Valor autorizado
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">
            {brl(data?.valor_autorizado ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Valor aguardando emissão
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-amber-600">
            {brl(data?.valor_pendente ?? 0)}
          </p>
        </Card>
      </div>

      <Tabs defaultValue="documentos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="servicos">Serviços fiscais</TabsTrigger>
          <TabsTrigger value="configuracao">Configuração</TabsTrigger>
        </TabsList>

        <TabsContent value="documentos">
          <FiscalDocuments />
        </TabsContent>
        <TabsContent value="servicos">
          <FiscalServiceCodes />
        </TabsContent>
        <TabsContent value="configuracao">
          <FiscalSettingsForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
