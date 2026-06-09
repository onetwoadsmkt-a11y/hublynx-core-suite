import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Hublynx Core" }] }),
  component: () => <ModulePlaceholder title="Financeiro" description="Contas a receber, a pagar, fluxo de caixa e gráficos." />,
});
