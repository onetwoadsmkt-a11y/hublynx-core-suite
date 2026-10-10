import { createFileRoute, redirect } from "@tanstack/react-router";

/** Rota antiga: o Financeiro saiu do CRM e vai virar um app separado. */
export const Route = createFileRoute("/_authenticated/financeiro/$")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
