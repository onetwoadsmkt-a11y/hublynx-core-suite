import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { BottomBar } from "@/components/app-mobile/BottomBar";
import { NewActionSheet } from "@/components/app-mobile/NewActionSheet";
import { TaskQuickForm } from "@/components/tasks/TaskQuickForm";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Central de Tarefas — Hublynx" },
      { name: "theme-color", content: "#00D084" },
      { name: "apple-mobile-web-app-title", content: "Tarefas" },
    ],
    links: [
      { rel: "manifest", href: "/manifest-tarefas.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-tarefas-512.png" },
    ],
  }),
  component: AppMobileLayout,
});

function AppMobileLayout() {
  const [openNew, setOpenNew] = useState(false);
  const [openTask, setOpenTask] = useState(false);
  const navigate = useNavigate();

  // Registra service worker de push (somente no PWA)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const host = window.location.hostname;
    const isPreview = host.startsWith("id-preview--") || host.startsWith("preview--");
    if (isPreview) return;
    navigator.serviceWorker.register("/sw-push.js").catch(() => {});
  }, []);

  const handlePick = (kind: "tarefa" | "projeto" | "cliente" | "lembrete") => {
    setOpenNew(false);
    if (kind === "tarefa") {
      setOpenTask(true);
    } else if (kind === "projeto") {
      navigate({ to: "/projetos" });
      toast.info("Crie o projeto pela tela completa.");
    } else if (kind === "cliente") {
      navigate({ to: "/clientes" });
      toast.info("Crie o cliente pela tela completa.");
    } else {
      navigate({ to: "/app/lembretes" });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg">
        <Outlet />
      </div>
      <BottomBar onNewClick={() => setOpenNew(true)} />
      <NewActionSheet open={openNew} onOpenChange={setOpenNew} onPick={handlePick} />
      <TaskQuickForm open={openTask} onOpenChange={setOpenTask} />
    </div>
  );
}
