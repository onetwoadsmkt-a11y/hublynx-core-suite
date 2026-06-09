import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Hublynx Core" }] }),
  component: () => <ModulePlaceholder title="Relatórios" description="Indicadores de receita, clientes ativos, projetos e taxa de conclusão." />,
});
