import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Core Suite — Gestão integrada" },
    { name: "description", content: "Acesse sua gestão de projetos, tarefas e relacionamento no Core Suite." },
    { property: "og:title", content: "Core Suite — Gestão integrada" },
    { property: "og:description", content: "Gestão integrada de projetos, tarefas e relacionamento." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
