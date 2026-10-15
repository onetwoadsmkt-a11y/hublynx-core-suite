import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { renderAppIcon } from "@/lib/portal/app-icon";
import { extractLogoPalette } from "@/lib/portal/logo-palette";
import { setPortalAppIcon } from "@/lib/projects/access.functions";

const VERSION = "v1";

/**
 * Mantém o ícone do app do portal deste projeto em dia (logo do cliente + nome
 * do projeto). Só gera de novo quando a logo, o nome ou a cor mudam.
 */
export function usePortalAppIcon(input: {
  projectId: string | null | undefined;
  name: string | null | undefined;
  projectLogo: string | null | undefined;
  orgLogo: string | null | undefined;
  brandColor: string | null | undefined;
  enabled?: boolean;
}) {
  const saveFn = useServerFn(setPortalAppIcon);
  const { projectId, name, projectLogo, orgLogo, brandColor, enabled = true } = input;
  useEffect(() => {
    if (!enabled || !projectId || !name || typeof window === "undefined") return;
    const logo = projectLogo || orgLogo || null;
    const sig = JSON.stringify([VERSION, name, logo, brandColor ?? null]);
    const key = `portal_icon_sig_${projectId}`;
    try {
      if (localStorage.getItem(key) === sig) return;
    } catch {
      /* sem storage: gera mesmo assim */
    }
    let alive = true;
    (async () => {
      const pal = logo ? await extractLogoPalette(logo) : {};
      const accent = brandColor || pal.primary || "#0a2557";
      const ink = pal.ink || "#1f2937";
      await document.fonts?.load?.("700 40px Lexend").catch(() => null);
      const icon = { logoUrl: logo, name, ink, accent };
      const [icon192, icon512] = await Promise.all([
        renderAppIcon(icon, 192),
        renderAppIcon(icon, 512),
      ]);
      if (!alive) return;
      await saveFn({ data: { projectId, icon192, icon512 } });
      try {
        localStorage.setItem(key, sig);
      } catch {
        /* ok */
      }
    })().catch(() => null); // sem permissão ou logo sem CORS: fica o ícone padrão
    return () => {
      alive = false;
    };
  }, [projectId, name, projectLogo, orgLogo, brandColor, enabled, saveFn]);
}
