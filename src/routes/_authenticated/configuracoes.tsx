import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Hublynx Core" }] }),
  component: () => <ModulePlaceholder title="Configurações" description="Perfil, empresa, usuários e preferências." />,
});
