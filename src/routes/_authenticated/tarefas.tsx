import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({ meta: [{ title: "Tarefas — Hublynx Core" }] }),
  component: () => <ModulePlaceholder title="Tarefas" description="Kanban, lista e calendário com drag-and-drop chegam na próxima fase." />,
});
