import { createFileRoute, redirect } from "@tanstack/react-router";

/** Rota antiga: "Minha semana" foi unificada no Dashboard. */
export const Route = createFileRoute("/_authenticated/semana")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
