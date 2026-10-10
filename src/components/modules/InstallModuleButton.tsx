import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { markModuleInstalled } from "@/lib/modules/modules.functions";
import { toast } from "sonner";
import type { ModuleDef } from "@/lib/modules/registry";
import { useWorkspace } from "@/hooks/useWorkspace";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallModuleButton({
  module,
  installed,
}: {
  module: ModuleDef;
  installed?: boolean;
}) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [done, setDone] = useState(!!installed);
  const mark = useServerFn(markModuleInstalled);
  const { activeOrganizationId } = useWorkspace();

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      setEvt(e as BIPEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function onClick() {
    if (!evt) {
      toast.info("Abra a rota do módulo e use 'Instalar app' do seu navegador.");
      return;
    }
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === "accepted") {
      setDone(true);
      try {
        await mark({ data: { slug: module.slug, organizationId: activeOrganizationId ?? undefined } });
      } catch {
        /* noop */
      }
      toast.success(`${module.name} instalado.`);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={done}>
      {done ? <Check className="h-4 w-4 mr-2" /> : <Download className="h-4 w-4 mr-2" />}
      {done ? "Instalado" : "Instalar como app"}
    </Button>
  );
}
