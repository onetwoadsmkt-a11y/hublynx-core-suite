import { createFileRoute, redirect } from "@tanstack/react-router";

/** Rota antiga: os relatórios comerciais agora ficam em /relatorios. */
export const Route = createFileRoute("/_authenticated/comercial/relatorios")({
  beforeLoad: () => {
    throw redirect({ to: "/relatorios", replace: true });
  },
});
