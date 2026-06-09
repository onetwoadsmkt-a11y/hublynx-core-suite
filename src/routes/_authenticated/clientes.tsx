import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Hublynx Core" }] }),
  component: () => <ModulePlaceholder title="Clientes" description="Cadastro completo de clientes, contratos e histórico de faturamento." />,
});
