import { createFileRoute, redirect } from "@tanstack/react-router";

/** Rota antiga: a tela de clientes agora fica em /clientes. */
export const Route = createFileRoute("/_authenticated/gestao/clientes")({
  beforeLoad: () => {
    throw redirect({ to: "/clientes", replace: true });
  },
});
