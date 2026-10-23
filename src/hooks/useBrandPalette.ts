import { useEffect, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { extractLogoPalette } from "@/lib/portal/logo-palette";

const HEX = /^#[0-9a-f]{6}$/i;
/** Identidade do Core Suite quando a empresa não tem logo/cor. */
const CORE = { primary: "#00D084", ink: "#0a2557" };

/**
 * Cores da marca da empresa ativa: tiradas do logo (cor viva = destaque, cor escura =
 * títulos e fundos), como no portal do cliente. Sem logo, usa a cor cadastrada;
 * sem nenhuma, a do Core Suite.
 */
export function useBrandPalette() {
  const { brand } = useWorkspace();
  const fallback = brand?.brandColor && HEX.test(brand.brandColor) ? brand.brandColor : null;
  const [pal, setPal] = useState<{ primary: string; ink: string }>({
    primary: fallback ?? CORE.primary,
    ink: CORE.ink,
  });
  useEffect(() => {
    let alive = true;
    setPal({ primary: fallback ?? CORE.primary, ink: CORE.ink });
    if (brand?.logoUrl) {
      extractLogoPalette(brand.logoUrl).then((p) => {
        if (!alive) return;
        setPal({
          primary: p.primary && HEX.test(p.primary) ? p.primary : fallback ?? CORE.primary,
          ink: p.ink && HEX.test(p.ink) ? p.ink : CORE.ink,
        });
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [brand?.logoUrl, fallback]);
  return pal;
}
