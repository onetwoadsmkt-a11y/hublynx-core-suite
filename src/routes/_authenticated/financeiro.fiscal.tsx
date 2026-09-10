import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/financeiro/fiscal")({
  component: FiscalPage,
});

function FiscalPage() {
  return (
    <Card className="flex min-h-[45vh] flex-col items-center justify-center p-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">Emissão de NFS-e ainda não configurada</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Quando a emissão fiscal for ativada, as notas de serviço, os impostos e o histórico
        de emissões aparecerão aqui.
      </p>
    </Card>
  );
}
