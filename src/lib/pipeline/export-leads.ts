import * as XLSX from "xlsx";
import type { Lead, LeadEvent, PipelineStage } from "@/components/pipeline/types";

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR");
}

function leadRow(l: Lead, stageName?: string, pipelineName?: string) {
  return {
    Nome: l.name,
    Empresa: l.company ?? "",
    "E-mail": l.email ?? "",
    Telefone: l.phone ?? "",
    Cidade: l.city ?? "",
    Estado: l.state ?? "",
    Etapa: stageName ?? "",
    Pipeline: pipelineName ?? "",
    Status: l.status,
    Valor: l.value != null ? Number(l.value) : "",
    Origem: l.source ?? "",
    "UTM Source": l.utm_source ?? "",
    "UTM Medium": l.utm_medium ?? "",
    "UTM Campaign": l.utm_campaign ?? "",
    "UTM Term": l.utm_term ?? "",
    "UTM Content": l.utm_content ?? "",
    GCLID: l.gclid ?? "",
    FBCLID: l.fbclid ?? "",
    "Landing URL": l.landing_url ?? "",
    Referrer: l.referrer ?? "",
    Tags: (l.tags ?? []).join(", "),
    "Último contato": fmtDate(l.last_contact_at),
    "Criado em": fmtDate(l.created_at),
  };
}

function save(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

/** Exporta a lista de leads exibida na página. */
export function exportLeadsToExcel(
  leads: Lead[],
  stageById: Map<string, PipelineStage>,
  pipelineNameById: Map<string, string>,
  filename = `leads-${new Date().toISOString().slice(0, 10)}.xlsx`,
) {
  const rows = leads.map((l) => {
    const stage = l.stage_id ? stageById.get(l.stage_id) : undefined;
    const pipeline = stage?.pipeline_id ? pipelineNameById.get(stage.pipeline_id) : undefined;
    return leadRow(l, stage?.name, pipeline);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Leads");
  save(wb, filename);
}

/** Exporta um lead com o histórico da jornada em abas separadas. */
export function exportLeadDetailToExcel(
  lead: Lead,
  events: LeadEvent[],
  stageName?: string,
  pipelineName?: string,
) {
  const wb = XLSX.utils.book_new();
  const info = Object.entries(leadRow(lead, stageName, pipelineName)).map(([Campo, Valor]) => ({
    Campo,
    Valor,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), "Lead");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      events.map((e) => ({
        Data: fmtDate(e.created_at),
        Tipo: e.kind,
        Título: e.title,
        Descrição: e.description ?? "",
      })),
    ),
    "Jornada",
  );
  const safe = lead.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();
  save(wb, `lead-${safe}.xlsx`);
}
