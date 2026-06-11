import { createFileRoute } from "@tanstack/react-router";
import { FinanceListPage } from "./financeiro.receber";

export const Route = createFileRoute("/_authenticated/financeiro/pagar")({
  component: () => <FinanceListPage kind="pagar" title="Contas a Pagar" />,
});
