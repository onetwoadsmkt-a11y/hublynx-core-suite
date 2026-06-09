import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/arquivos")({
  head: () => ({ meta: [{ title: "Arquivos — Hublynx Core" }] }),
  component: () => <ModulePlaceholder title="Arquivos" description="Upload e gestão por categoria (contratos, propostas, financeiro, projetos, artes, vídeos)." />,
});
