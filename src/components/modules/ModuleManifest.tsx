import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { moduleForPath } from "@/lib/modules/registry";

/**
 * Swaps <link rel="manifest"> and <meta name="theme-color"> based on the current
 * route, so each module scope acts as its own installable PWA.
 * Mounted once inside the authenticated layout.
 */
export function ModuleManifest() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const mod = moduleForPath(pathname);
    const manifestHref = mod?.manifest ?? "/manifest.webmanifest";
    const themeColor = mod?.themeColor ?? "#0b1220";
    const appleIcon = mod?.appleIcon ?? "/apple-touch-icon.png";
    const appleTitle = mod?.shortName ?? "Hublynx";

    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    if (link.href.endsWith(manifestHref) === false) link.href = manifestHref;

    let theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!theme) {
      theme = document.createElement("meta");
      theme.name = "theme-color";
      document.head.appendChild(theme);
    }
    theme.content = themeColor;

    let apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!apple) {
      apple = document.createElement("link");
      apple.rel = "apple-touch-icon";
      document.head.appendChild(apple);
    }
    apple.href = appleIcon;

    let appleT = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    if (!appleT) {
      appleT = document.createElement("meta");
      appleT.name = "apple-mobile-web-app-title";
      document.head.appendChild(appleT);
    }
    appleT.content = appleTitle;
  }, [pathname]);

  return null;
}
