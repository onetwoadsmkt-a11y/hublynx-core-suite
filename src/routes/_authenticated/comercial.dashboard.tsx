import { createFileRoute, redirect } from "@tanstack/react-router";

/** Rota antiga: o dashboard comercial agora faz parte do Dashboard. */
export const Route = createFileRoute("/_authenticated/comercial/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
