import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leadTaskDisplay, type LeadScheduledTask } from "./task-display";

const scheduled: LeadScheduledTask = {
  id: "schedule-1", lead_id: "lead-demo", owner_id: "owner-1", title: "Contato com demo",
  notes: "Confirmar proposta", kind: "follow_up", due_at: "2026-10-21T18:00:00Z",
  done: false, completed_at: null, duration_minutes: 30, gcal_event_id: null, meet_link: null,
  created_at: "2026-10-21T17:00:00Z", updated_at: "2026-10-21T17:00:00Z",
  leads: { id: "lead-demo", name: "demo", converted_client_id: null, converted_project_id: null },
};

describe("agendamentos de leads na central de tarefas", () => {
  it("preserva data e horário para Lista e Calendário", () => {
    assert.equal(leadTaskDisplay(scheduled).due_date, "2026-10-21T18:00:00Z");
  });
  it("inclui tarefa pendente na coluna a fazer do Kanban", () => {
    assert.equal(leadTaskDisplay(scheduled).status, "a_fazer");
  });
  it("reflete conclusão do agendamento no Kanban e na Lista", () => {
    assert.equal(leadTaskDisplay({ ...scheduled, done: true }).status, "concluido");
  });
  it("não confunde agendamento com tarefa geral de mesmo id", () => {
    assert.equal(leadTaskDisplay(scheduled).id, "lead:schedule-1");
    assert.equal(leadTaskDisplay(scheduled).leadTask.id, "schedule-1");
  });
  it("mantém tarefa sem data na Lista e no Kanban sem inventar agendamento", () => {
    assert.equal(leadTaskDisplay({ ...scheduled, due_at: null }).due_date, null);
  });
  it("preserva cliente e projeto de lead convertido para filtros", () => {
    const task = leadTaskDisplay({ ...scheduled, leads: { ...scheduled.leads, converted_client_id: "client-1", converted_project_id: "project-1" } });
    assert.equal(task.client_id, "client-1");
    assert.equal(task.project_id, "project-1");
  });
});