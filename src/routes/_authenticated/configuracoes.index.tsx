import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export const Route = createFileRoute("/_authenticated/configuracoes/")({
  component: () => (
    <ModulePlaceholder title="Configurações" description="Perfil, empresa, usuários e preferências." />
  ),
});
