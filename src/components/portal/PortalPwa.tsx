import { useEffect, useState } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * App (PWA) do Portal do cliente, separado do Core: cada projeto instala como um
 * app próprio (nome do projeto, cores da empresa) que abre direto no portal.
 */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

// o navegador avisa uma vez, às vezes antes da tela montar: guarda o aviso
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

function setHead(selector: string, create: () => HTMLElement, apply: (el: HTMLElement) => void) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  apply(el);
}

/** Troca o manifesto/ícones da página para os do app do portal deste projeto. */
export function usePortalPwa(projectRef: string | null | undefined, themeColor?: string | null) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const ref = projectRef && /^[a-z0-9-]{1,160}$/i.test(projectRef) ? projectRef : "inicio";
    const prev = document.head
      .querySelector<HTMLLinkElement>('link[rel="manifest"]')
      ?.getAttribute("href");
    setHead(
      'link[rel="manifest"]',
      () => Object.assign(document.createElement("link"), { rel: "manifest" }),
      (el) => el.setAttribute("href", `/api/public/portal/manifest/${ref}`),
    );
    setHead(
      'link[rel="apple-touch-icon"]',
      () => Object.assign(document.createElement("link"), { rel: "apple-touch-icon" }),
      (el) => el.setAttribute("href", `/api/public/portal/icon/${ref}?s=192`),
    );
    const metas: [string, string][] = [
      ["apple-mobile-web-app-capable", "yes"],
      ["mobile-web-app-capable", "yes"],
      ["apple-mobile-web-app-title", "Portal"],
      ["apple-mobile-web-app-status-bar-style", "default"],
    ];
    for (const [name, content] of metas) {
      setHead(
        `meta[name="${name}"]`,
        () => Object.assign(document.createElement("meta"), { name }),
        (el) => el.setAttribute("content", content),
      );
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/portal/sw.js", { scope: "/portal/" }).catch(() => null);
    }
    return () => {
      const link = document.head.querySelector('link[rel="manifest"]');
      if (link && prev) link.setAttribute("href", prev);
    };
  }, [projectRef]);

  useEffect(() => {
    if (typeof document === "undefined" || !themeColor) return;
    setHead(
      'meta[name="theme-color"]',
      () => Object.assign(document.createElement("meta"), { name: "theme-color" }),
      (el) => el.setAttribute("content", themeColor),
    );
  }, [themeColor]);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Botão "Instalar app": usa o aviso do navegador; no iPhone mostra o passo a passo. */
export function PortalInstallButton({ className }: { className?: string }) {
  const [, force] = useState(0);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(isStandalone());
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (installed) return null;
  const ios = isIos();
  if (!deferred && !ios) return null;

  async function install() {
    if (deferred) {
      const e = deferred;
      await e.prompt();
      await e.userChoice.catch(() => null);
      deferred = null;
      force((n) => n + 1);
    } else {
      setHelp(true);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={className ?? "h-10 text-muted-foreground hover:text-foreground"}
        onClick={install}
      >
        <Download className="h-4 w-4 sm:mr-1.5" />
        <span className="hidden sm:inline">Instalar app</span>
      </Button>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Instalar o app do portal</DialogTitle>
            <DialogDescription>No iPhone ou iPad, pelo Safari:</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <Share className="h-5 w-5 shrink-0" /> Toque em <strong>Compartilhar</strong> na barra
              do Safari.
            </li>
            <li className="flex items-center gap-3">
              <SquarePlus className="h-5 w-5 shrink-0" /> Escolha{" "}
              <strong>Adicionar à Tela de Início</strong>.
            </li>
            <li className="flex items-center gap-3">
              <Download className="h-5 w-5 shrink-0" /> Confirme em <strong>Adicionar</strong>. O
              app abre direto no seu projeto.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
