import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Hublynx Core" }] }),
  component: () => <ModulePlaceholder title="Agenda" description="Calendário com visualizações dia / semana / mês." />,
});
