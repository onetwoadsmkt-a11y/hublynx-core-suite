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

type JourneyTask = {
  title: string;
  kind: string;
  due_at: string | null;
  done: boolean;
  completed_at: string | null;
  notes: string | null;
  meet_link?: string | null;
  duration_minutes?: number | null;
};

/** Exporta a jornada do lead: histórico, agendamentos e próxima ação. */
export function exportLeadJourneyToExcel(
  lead: Lead,
  events: LeadEvent[],
  tasks: JourneyTask[],
  stageName?: string,
  pipelineName?: string,
) {
  const wb = XLSX.utils.book_new();

  const pending = tasks
    .filter((t) => !t.done && t.due_at)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
  const next = pending[0];

  const resumo = Object.entries({
    ...leadRow(lead, stageName, pipelineName),
    "Próxima ação": next ? next.title : "Sem próxima ação agendada",
    "Próxima ação — tipo": next?.kind ?? "",
    "Próxima ação — data": fmtDate(next?.due_at),
    "Agendamentos pendentes": pending.length,
    "Agendamentos concluídos": tasks.filter((t) => t.done).length,
    "Eventos na jornada": events.length,
  }).map(([Campo, Valor]) => ({ Campo, Valor }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");

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

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      tasks.map((t) => ({
        Título: t.title,
        Tipo: t.kind,
        "Data/Hora": fmtDate(t.due_at),
        "Duração (min)": t.duration_minutes ?? "",
        Status: t.done ? "Concluído" : "Pendente",
        "Concluído em": fmtDate(t.completed_at),
        "Link da reunião": t.meet_link ?? "",
        Observações: t.notes ?? "",
      })),
    ),
    "Agendamentos",
  );

  const safe = lead.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();
  save(wb, `jornada-${safe}.xlsx`);
}
