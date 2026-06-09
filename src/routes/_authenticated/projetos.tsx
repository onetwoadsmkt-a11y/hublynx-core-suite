import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/projetos")({
  head: () => ({ meta: [{ title: "Projetos — Hublynx Core" }] }),
  component: () => <ModulePlaceholder title="Projetos" description="Gerenciamento completo de projetos com tarefas, arquivos, comentários e histórico." />,
});
