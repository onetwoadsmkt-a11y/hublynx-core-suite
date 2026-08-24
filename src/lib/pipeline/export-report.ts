import * as XLSX from "xlsx";
import type { Lead, PipelineStage } from "@/components/pipeline/types";
import {
  LEAD_FIELDS,
  fmtDateTimeBR,
  leadFieldValue,
  type LeadFieldKey,
} from "./report-fields";

export type ReportNote = { id: string; lead_id: string; body: string; created_at: string };
export type ReportEvent = {
  id: string;
  lead_id: string;
  kind: string;
  title: string;
  description: string | null;
  created_at: string;
};

function autoWidth(ws: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const widths: number[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v == null) continue;
      widths[c] = Math.max(widths[c] ?? 10, Math.min(String(cell.v).length + 2, 60));
    }
  }
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

function groupBy<T extends { lead_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const arr = map.get(r.lead_id) ?? [];
    arr.push(r);
    map.set(r.lead_id, arr);
  }
  return map;
}

export type ReportOptions = {
  fields: LeadFieldKey[];
  includeNotes: boolean;
  includeJourney: boolean;
  filename?: string;
};

export function exportLeadsReportToExcel(
  input: {
    leads: Lead[];
    stages: PipelineStage[];
    pipelines: { id: string; name: string }[];
    notes: ReportNote[];
    events: ReportEvent[];
  },
  opts: ReportOptions,
) {
  const { leads, stages, pipelines, notes, events } = input;
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const pipelineById = new Map(pipelines.map((p) => [p.id, p.name]));
  const notesByLead = groupBy(notes);
  const eventsByLead = groupBy(events);
  const labelOf = new Map(LEAD_FIELDS.map((f) => [f.key, f.label]));

  const maxNotes = opts.includeNotes
    ? leads.reduce((m, l) => Math.max(m, notesByLead.get(l.id)?.length ?? 0), 0)
    : 0;
  const maxEvents = opts.includeJourney
    ? leads.reduce((m, l) => Math.max(m, eventsByLead.get(l.id)?.length ?? 0), 0)
    : 0;

  const ctxOf = (l: Lead) => {
    const stage = l.stage_id ? stageById.get(l.stage_id) : undefined;
    return {
      stageName: stage?.name,
      pipelineName: stage?.pipeline_id ? pipelineById.get(stage.pipeline_id) : undefined,
    };
  };

  const mainRows = leads.map((l) => {
    const ctx = ctxOf(l);
    const row: Record<string, string | number> = {};
    for (const key of opts.fields) {
      row[labelOf.get(key) ?? key] = leadFieldValue(l, key, ctx);
    }
    if (opts.includeNotes) {
      const ns = notesByLead.get(l.id) ?? [];
      row["Qtd. anotações"] = ns.length;
      for (let i = 0; i < maxNotes; i++) {
        const n = ns[i];
        row[`Anotação ${i + 1}`] = n ? `${fmtDateTimeBR(n.created_at)} — ${n.body}` : "";
      }
    }
    if (opts.includeJourney) {
      const es = eventsByLead.get(l.id) ?? [];
      row["Qtd. eventos"] = es.length;
      for (let i = 0; i < maxEvents; i++) {
        const e = es[i];
        row[`Jornada ${i + 1}`] = e
          ? `${fmtDateTimeBR(e.created_at)} — ${e.title}${e.description ? `: ${e.description}` : ""}`
          : "";
      }
    }
    return row;
  });

  const wb = XLSX.utils.book_new();
  const wsMain = XLSX.utils.json_to_sheet(mainRows);
  autoWidth(wsMain);
  XLSX.utils.book_append_sheet(wb, wsMain, "Leads");

  if (opts.includeNotes) {
    const rows = leads.flatMap((l) =>
      (notesByLead.get(l.id) ?? []).map((n, i) => ({
        Lead: l.name,
        Empresa: l.company ?? "",
        "E-mail": l.email ?? "",
        Telefone: l.phone ?? "",
        "Nº": i + 1,
        Data: fmtDateTimeBR(n.created_at),
        Anotação: n.body,
      })),
    );
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Lead: "", Anotação: "" }]);
    autoWidth(ws);
    XLSX.utils.book_append_sheet(wb, ws, "Anotações");
  }

  if (opts.includeJourney) {
    const rows = leads.flatMap((l) =>
      (eventsByLead.get(l.id) ?? []).map((e, i) => ({
        Lead: l.name,
        Empresa: l.company ?? "",
        "Nº": i + 1,
        Data: fmtDateTimeBR(e.created_at),
        Tipo: e.kind,
        Título: e.title,
        Descrição: e.description ?? "",
      })),
    );
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Lead: "", Título: "" }]);
    autoWidth(ws);
    XLSX.utils.book_append_sheet(wb, ws, "Jornada");
  }

  XLSX.writeFile(
    wb,
    opts.filename ?? `relatorio-leads-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
