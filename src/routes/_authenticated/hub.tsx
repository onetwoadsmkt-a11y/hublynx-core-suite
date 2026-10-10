import { createFileRoute, redirect } from "@tanstack/react-router";

/** Rota antiga: o Hub Central foi unificado no Dashboard. */
export const Route = createFileRoute("/_authenticated/hub")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
