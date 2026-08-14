import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileSpreadsheet, Pencil, History } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getLeadDetail } from "@/lib/pipeline/pipeline.functions";
import { exportLeadDetailToExcel } from "@/lib/pipeline/export-leads";
import type { Lead, PipelineStage } from "./types";

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}

export function LeadViewDialog({
  lead,
  stage,
  pipelineName,
  onOpenChange,
  onEdit,
}: {
  lead: Lead | null;
  stage?: PipelineStage;
  pipelineName?: string;
  onOpenChange: (open: boolean) => void;
  onEdit?: (lead: Lead) => void;
}) {
  const detailFn = useServerFn(getLeadDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["lead-detail", lead?.id],
    queryFn: () => detailFn({ data: { leadId: lead!.id } }),
    enabled: !!lead,
  });

  if (!lead) return null;
  const events = data?.events ?? [];

  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 gap-0">
        <DialogHeader className="lead-gradient-card rounded-t-lg px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-white">{lead.name}</DialogTitle>
              <p className="mt-1 text-sm text-white/80">
                {lead.company || "Sem empresa"}
                {stage ? ` · ${stage.name}` : ""}
                {pipelineName ? ` · ${pipelineName}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => exportLeadDetailToExcel(lead, events, stage?.name, pipelineName)}
              >
                <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Exportar Excel
              </Button>
              {onEdit && (
                <Button
                  size="sm"
                  className="bg-[#00D084] text-white hover:bg-[#00b873]"
                  onClick={() => onEdit(lead)}
                >
                  <Pencil className="mr-1.5 h-4 w-4" /> Editar
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-5 p-6">
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="E-mail" value={lead.email} />
              <Field label="Telefone" value={lead.phone} />
              <Field
                label="Valor"
                value={
                  lead.value != null
                    ? Number(lead.value).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })
                    : null
                }
              />
              <Field label="Cidade/UF" value={[lead.city, lead.state].filter(Boolean).join(" / ")} />
              <Field label="Origem" value={lead.source} />
              <Field label="Status" value={<Badge variant="outline">{lead.status}</Badge>} />
            </section>

            <Separator />

            <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="UTM Source" value={lead.utm_source} />
              <Field label="UTM Medium" value={lead.utm_medium} />
              <Field label="UTM Campaign" value={lead.utm_campaign} />
              <Field label="UTM Term" value={lead.utm_term} />
              <Field label="UTM Content" value={lead.utm_content} />
              <Field label="GCLID" value={lead.gclid} />
            </section>

            <Separator />

            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4" /> Histórico da jornada
              </h3>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando histórico…</p>
              ) : events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
              ) : (
                <ol className="relative space-y-4 border-l pl-5">
                  {events.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                      <p className="text-sm font-medium">{e.title}</p>
                      {e.description && (
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {e.description}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {format(new Date(e.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} ·{" "}
                        {e.kind}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
